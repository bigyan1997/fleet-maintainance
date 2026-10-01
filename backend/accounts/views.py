from django.conf import settings
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


def _user_payload(user):
    return {"username": user.get_username(), "isStaff": user.is_staff}


@method_decorator(ensure_csrf_cookie, name="get")
class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"detail": "CSRF cookie set."})


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        email = request.data.get("email", "").strip()
        password = request.data.get("password", "")

        User = get_user_model()
        account = User.objects.filter(email__iexact=email).first() if email else None
        username = account.username if account else ""

        user = authenticate(request, username=username, password=password)
        if user is None:
            return Response({"detail": "Invalid email or password."}, status=400)
        login(request, user)
        return Response(_user_payload(user))


class GoogleLoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        credential = request.data.get("credential", "")
        if not credential:
            return Response({"detail": "Missing Google credential."}, status=400)
        if not settings.GOOGLE_OAUTH_CLIENT_ID or not settings.GOOGLE_ALLOWED_EMAIL:
            return Response({"detail": "Google sign-in is not configured."}, status=503)

        try:
            payload = google_id_token.verify_oauth2_token(
                credential, google_requests.Request(), settings.GOOGLE_OAUTH_CLIENT_ID
            )
        except ValueError:
            return Response({"detail": "Invalid Google credential."}, status=400)

        email = (payload.get("email") or "").lower()
        if not payload.get("email_verified") or email != settings.GOOGLE_ALLOWED_EMAIL.lower():
            return Response({"detail": "This Google account is not authorized."}, status=403)

        User = get_user_model()
        user, _ = User.objects.get_or_create(
            username=email, defaults={"email": email, "is_staff": True}
        )
        login(request, user)
        return Response(_user_payload(user))


class LogoutView(APIView):
    def post(self, request):
        logout(request)
        return Response({"detail": "Logged out."})


class MeView(APIView):
    def get(self, request):
        return Response(_user_payload(request.user))
