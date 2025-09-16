import mimetypes
import os

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import FileResponse, Http404, HttpResponseForbidden
from django.views.decorators.http import require_GET

from apps.media_library.models import MediaFile

STREAM_SIGNER = TimestampSigner(salt="media-library-stream")
TOKEN_TTL = getattr(settings, "MEDIA_LIBRARY_STREAM_TOKEN_TTL", 3600)


@require_GET
def stream_media_file(request, token: str):
    try:
        payload = STREAM_SIGNER.unsign_object(token, max_age=TOKEN_TTL)
    except SignatureExpired:
        return HttpResponseForbidden("Stream link expired")
    except BadSignature:
        raise Http404("Invalid stream token")

    file_id = payload.get("file_id")
    user_id = payload.get("user_id")

    if request.user.is_authenticated and request.user.id != user_id:
        return HttpResponseForbidden("Stream token not issued for this user")

    try:
        media_file = MediaFile.objects.get(pk=file_id)
    except MediaFile.DoesNotExist:
        raise Http404("Media file not found")

    path = media_file.absolute_path
    if not path or not os.path.exists(path):
        raise Http404("Media file not found")

    mime_type, _ = mimetypes.guess_type(path)
    mime_type = mime_type or "application/octet-stream"

    response = FileResponse(open(path, "rb"), content_type=mime_type)
    try:
        size = os.path.getsize(path)
        response["Content-Length"] = str(size)
    except OSError:
        pass

    response["Content-Disposition"] = f"inline; filename=\"{os.path.basename(path)}\""
    return response
