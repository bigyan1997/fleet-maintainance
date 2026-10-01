from django.urls import path

from .views import CsrfView, GoogleLoginView, LoginView, LogoutView, MeView

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="csrf"),
    path("login/", LoginView.as_view(), name="login"),
    path("google-login/", GoogleLoginView.as_view(), name="google-login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
]
