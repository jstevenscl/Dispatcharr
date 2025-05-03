import requests

class Client:
    host = ""
    username = ""
    password = ""

    def __init__(self, host, username, password):
        self.host = host
        self.username = username
        self.password = password

    def authenticate(self):
        response = requests.get(f"{self.host}/player_api.php?username={self.username}&password={self.password}")
        return response.json()

    def get_live_categories(self):
        response = requests.get(f"{self.host}/player_api.php?username={self.username}&password={self.password}&action=get_live_categories")
        return response.json()

    def get_live_category_streams(self, category_id):
        response = requests.get(f"{self.host}/player_api.php?username={self.username}&password={self.password}&action=get_live_streams&category_id={category_id}")
        return response.json()

    def get_stream_url(self, stream_id):
        return f"{self.host}/{self.username}/{self.password}/{stream_id}"
