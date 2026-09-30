from django.urls import path

from .views import ChangePasswordView, CsrfView, GoogleLoginView, LoginView, LogoutView, MeView, UserDetailView, UsersView

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="csrf"),
    path("login/", LoginView.as_view(), name="login"),
    path("google-login/", GoogleLoginView.as_view(), name="google-login"),
    path("logout/", LogoutView.as_view(), name="logout"),
    path("me/", MeView.as_view(), name="me"),
    path("users/", UsersView.as_view(), name="users"),
    path("users/<int:pk>/", UserDetailView.as_view(), name="user-detail"),
    path("password/", ChangePasswordView.as_view(), name="change-password"),
]
