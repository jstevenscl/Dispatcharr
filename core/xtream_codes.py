import requests
import logging
import traceback
import json

logger = logging.getLogger(__name__)

class Client:
    """Xtream Codes API Client with robust error handling"""

    def __init__(self, server_url, username, password, user_agent=None):
        self.server_url = self._normalize_url(server_url)
        self.username = username
        self.password = password
        self.user_agent = user_agent

        # Fix: Properly handle all possible user_agent input types
        if user_agent:
            if isinstance(user_agent, str):
                # Direct string user agent
                user_agent_string = user_agent
            elif hasattr(user_agent, 'user_agent'):
                # UserAgent model object
                user_agent_string = user_agent.user_agent
            else:
                # Fallback for any other type
                logger.warning(f"Unexpected user_agent type: {type(user_agent)}, using default")
                user_agent_string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        else:
            # No user agent provided
            user_agent_string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

        self.headers = {'User-Agent': user_agent_string}
        self.server_info = None

    def _normalize_url(self, url):
        """Normalize server URL by removing trailing slashes and paths"""
        if not url:
            raise ValueError("Server URL cannot be empty")

        url = url.rstrip('/')
        # Remove any path after domain - we'll construct proper API URLs
        # Split by protocol first to preserve it
        if '://' in url:
            protocol, rest = url.split('://', 1)
            domain = rest.split('/', 1)[0]
            return f"{protocol}://{domain}"
        return url

    def _make_request(self, endpoint, params=None):
        """Make request with detailed error handling"""
        try:
            url = f"{self.server_url}/{endpoint}"
            logger.debug(f"XC API Request: {url} with params: {params}")

            response = requests.get(url, params=params, headers=self.headers, timeout=30)
            response.raise_for_status()

            # Check if response is empty
            if not response.content:
                error_msg = f"XC API returned empty response from {url}"
                logger.error(error_msg)
                raise ValueError(error_msg)

            # Check for common blocking responses before trying to parse JSON
            response_text = response.text.strip()
            if response_text.lower() in ['blocked', 'forbidden', 'access denied', 'unauthorized']:
                error_msg = f"XC API request blocked by server from {url}. Response: {response_text}"
                logger.error(error_msg)
                logger.error(f"This may indicate IP blocking, User-Agent filtering, or rate limiting")
                raise ValueError(error_msg)

            try:
                data = response.json()
            except requests.exceptions.JSONDecodeError as json_err:
                error_msg = f"XC API returned invalid JSON from {url}. Response: {response.text[:1000]}"
                logger.error(error_msg)
                logger.error(f"JSON decode error: {str(json_err)}")

                # Check if it looks like an HTML error page
                if response_text.startswith('<'):
                    logger.error("Response appears to be HTML - server may be returning an error page")

                raise ValueError(error_msg)

            # Check for XC-specific error responses
            if isinstance(data, dict) and data.get('user_info') is None and 'error' in data:
                error_msg = f"XC API Error: {data.get('error', 'Unknown error')}"
                logger.error(error_msg)
                raise ValueError(error_msg)

            return data
        except requests.RequestException as e:
            error_msg = f"XC API Request failed: {str(e)}"
            logger.error(error_msg)
            logger.error(f"Request details: URL={url}, Params={params}")
            raise
        except ValueError as e:
            # This could be from JSON parsing or our explicit raises
            logger.error(f"XC API Invalid response: {str(e)}")
            raise
        except Exception as e:
            logger.error(f"XC API Unexpected error: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    def authenticate(self):
        """Authenticate and validate server response"""
        try:
            endpoint = "player_api.php"
            params = {
                'username': self.username,
                'password': self.password
            }

            self.server_info = self._make_request(endpoint, params)

            if not self.server_info or not self.server_info.get('user_info'):
                error_msg = "Authentication failed: Invalid response from server"
                logger.error(f"{error_msg}. Response: {self.server_info}")
                raise ValueError(error_msg)

            logger.info(f"XC Authentication successful for user {self.username}")
            return self.server_info
        except Exception as e:
            logger.error(f"XC Authentication failed: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    def get_live_categories(self):
        """Get live TV categories"""
        try:
            if not self.server_info:
                self.authenticate()

            endpoint = "player_api.php"
            params = {
                'username': self.username,
                'password': self.password,
                'action': 'get_live_categories'
            }

            categories = self._make_request(endpoint, params)

            if not isinstance(categories, list):
                error_msg = f"Invalid categories response: {categories}"
                logger.error(error_msg)
                raise ValueError(error_msg)

            logger.info(f"Successfully retrieved {len(categories)} live categories")
            logger.debug(f"Categories: {json.dumps(categories[:5])}...")
            return categories
        except Exception as e:
            logger.error(f"Failed to get live categories: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    def get_live_category_streams(self, category_id):
        """Get streams for a specific category"""
        try:
            if not self.server_info:
                self.authenticate()

            endpoint = "player_api.php"
            params = {
                'username': self.username,
                'password': self.password,
                'action': 'get_live_streams',
                'category_id': category_id
            }

            streams = self._make_request(endpoint, params)

            if not isinstance(streams, list):
                error_msg = f"Invalid streams response for category {category_id}: {streams}"
                logger.error(error_msg)
                raise ValueError(error_msg)

            logger.info(f"Successfully retrieved {len(streams)} streams for category {category_id}")
            return streams
        except Exception as e:
            logger.error(f"Failed to get streams for category {category_id}: {str(e)}")
            logger.error(traceback.format_exc())
            raise

    def get_stream_url(self, stream_id):
        """Get the playback URL for a stream"""
        return f"{self.server_url}/live/{self.username}/{self.password}/{stream_id}.ts"
