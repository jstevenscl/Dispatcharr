import requests

class Client:
    host = ""
    username = ""
    password = ""
    user_agent = ""

    def __init__(self, host, username, password, user_agent):
        self.host = host
        self.username = username
        self.password = user_agent

    def authenticate(self):
        response = requests.get(f"{self.host}/player_api.php?username={self.username}&password={self.password}", headers={
            'User-Agent': self.user_agent,
        })
        return response.json()

    def get_live_categories(self):
        response = requests.get(f"{self.host}/player_api.php?username={self.username}&password={self.password}&action=get_live_categories", headers={
            'User-Agent': self.user_agent,
        })
        return response.json()

    def get_live_category_streams(self, category_id):
        response = requests.get(f"{self.host}/player_api.php?username={self.username}&password={self.password}&action=get_live_streams&category_id={category_id}", headers={
            'User-Agent': self.user_agent,
        })
        return response.json()

    def get_stream_url(self, stream_id):
        return f"{self.host}/{self.username}/{self.password}/{stream_id}"
