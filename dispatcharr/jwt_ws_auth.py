from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from rest_framework_simplejwt.tokens import UntypedToken
from django.contrib.auth.models import AnonymousUser
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from rest_framework_simplejwt.authentication import JWTAuthentication

User = get_user_model()

@database_sync_to_async
def get_user(validated_token):
    try:
        jwt_auth = JWTAuthentication()
        user = jwt_auth.get_user(validated_token)
        return user
    except:
        return AnonymousUser()

class JWTAuthMiddleware(BaseMiddleware):
    async def __call__(self, scope, receive, send):
        try:
            # Extract the token from the query string
            query_string = parse_qs(scope["query_string"].decode())
            token = query_string.get("token", [None])[0]

            if token is not None:
                validated_token = JWTAuthentication().get_validated_token(token)
                scope["user"] = await get_user(validated_token)
            else:
                scope["user"] = AnonymousUser()
        except (InvalidToken, TokenError):
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)
