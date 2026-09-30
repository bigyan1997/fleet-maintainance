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


# ── Team: logins for the office (you, your boss) ──────────────────────────


def _team_row(user, me):
    return {
        "id": user.pk,
        "email": user.email or user.username,
        "name": user.get_full_name(),
        "active": user.is_active,
        "lastLogin": user.last_login,
        "isMe": user.pk == me.pk,
    }


class UsersView(APIView):
    def get(self, request):
        User = get_user_model()
        return Response([_team_row(u, request.user) for u in User.objects.order_by("-is_active", "email", "username")])

    def post(self, request):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError

        from fleet import activity

        if not request.user.is_staff:
            return Response({"detail": "Only an office admin can add logins."}, status=403)
        email = (request.data.get("email") or "").strip().lower()
        name = (request.data.get("name") or "").strip()
        password = request.data.get("password") or ""
        User = get_user_model()
        if not email or "@" not in email:
            return Response({"detail": "Enter their email address. They sign in with it."}, status=400)
        if User.objects.filter(email__iexact=email).exists() or User.objects.filter(username__iexact=email).exists():
            return Response({"detail": "Someone already signs in with that email."}, status=400)
        first, _, last = name.partition(" ")
        user = User(username=email, email=email, first_name=first, last_name=last, is_staff=True)
        try:
            validate_password(password, user)
        except ValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        user.set_password(password)
        user.save()
        activity.log(request.user, "Added", "User", f"Login for {name or email} ({email})")
        return Response(_team_row(user, request.user), status=201)


class UserDetailView(APIView):
    def patch(self, request, pk):
        from fleet import activity

        if not request.user.is_staff:
            return Response({"detail": "Only an office admin can change logins."}, status=403)
        User = get_user_model()
        user = User.objects.filter(pk=pk).first()
        if not user:
            return Response({"detail": "User not found."}, status=404)
        if "active" in request.data:
            if user.pk == request.user.pk:
                return Response({"detail": "You can't switch off your own login."}, status=400)
            user.is_active = bool(request.data["active"])
            user.save(update_fields=["is_active"])
            activity.log(request.user, "Changed", "User", f"Login for {user.email or user.username} {'switched on' if user.is_active else 'switched off'}")
        return Response(_team_row(user, request.user))


class ChangePasswordView(APIView):
    def post(self, request):
        from django.contrib.auth import update_session_auth_hash
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError

        if not request.user.check_password(request.data.get("current") or ""):
            return Response({"detail": "Your current password isn't right."}, status=400)
        new = request.data.get("new") or ""
        try:
            validate_password(new, request.user)
        except ValidationError as exc:
            return Response({"detail": " ".join(exc.messages)}, status=400)
        request.user.set_password(new)
        request.user.save()
        update_session_auth_hash(request, request.user)  # stay logged in
        return Response({"detail": "Password changed."})
