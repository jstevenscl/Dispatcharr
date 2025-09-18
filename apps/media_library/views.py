import mimetypes
import os
import re

from django.conf import settings
from django.core.signing import BadSignature, SignatureExpired, TimestampSigner
from django.http import (
    FileResponse,
    Http404,
    HttpResponse,
    HttpResponseForbidden,
    StreamingHttpResponse,
)
from django.views.decorators.http import require_GET

from apps.media_library.models import MediaFile

STREAM_SIGNER = TimestampSigner(salt="media-library-stream")
TOKEN_TTL = getattr(settings, "MEDIA_LIBRARY_STREAM_TOKEN_TTL", 3600)

mimetypes.add_type("video/x-matroska", ".mkv", strict=False)


def _iter_file(file_obj, offset=0, length=None, chunk_size=8192):
    file_obj.seek(offset)
    remaining = length
    while True:
        if remaining is not None and remaining <= 0:
            break
        read_size = chunk_size if remaining is None else min(chunk_size, remaining)
        data = file_obj.read(read_size)
        if not data:
            break
        if remaining is not None:
            remaining -= len(data)
        yield data


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
    file_size = os.path.getsize(path)

    range_header = request.headers.get("Range")
    if range_header:
        range_match = re.match(r"bytes=(\d+)-(\d*)", range_header)
        if range_match:
            start = int(range_match.group(1))
            end_raw = range_match.group(2)
            end = int(end_raw) if end_raw else file_size - 1
            if start >= file_size:
                response = HttpResponse(status=416)
                response["Content-Range"] = f"bytes */{file_size}"
                return response
            end = min(end, file_size - 1)
            length = end - start + 1

            file_handle = open(path, "rb")

            def closing_iterator():
                try:
                    yield from _iter_file(file_handle, offset=start, length=length)
                finally:
                    file_handle.close()

            response = StreamingHttpResponse(
                closing_iterator(), status=206, content_type=mime_type
            )
            response["Content-Length"] = str(length)
            response["Content-Range"] = f"bytes {start}-{end}/{file_size}"
            response["Accept-Ranges"] = "bytes"
            response["Content-Disposition"] = (
                f"inline; filename=\"{os.path.basename(path)}\""
            )
            return response

    response = FileResponse(open(path, "rb"), content_type=mime_type)
    response["Accept-Ranges"] = "bytes"
    response["Content-Length"] = str(file_size)
    response["Content-Disposition"] = f"inline; filename=\"{os.path.basename(path)}\""
    return response
