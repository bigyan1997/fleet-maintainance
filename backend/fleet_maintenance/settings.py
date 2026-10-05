"""
Django settings for fleet_maintenance project.
"""

from pathlib import Path
from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIST = BASE_DIR.parent / 'frontend' / 'dist'

SECRET_KEY = config('DJANGO_SECRET_KEY', default='dev-only-secret-key-change-me')

DEBUG = config('DJANGO_DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('DJANGO_ALLOWED_HOSTS', default='localhost,127.0.0.1', cast=Csv())
# Extra names this PC answers to, e.g. its Tailscale address for remote access.
ALLOWED_HOSTS += config('DJANGO_EXTRA_HOSTS', default='', cast=Csv())

# Google Sheets one-way mirror sync (see .env.example) — a brand-new, separate
# sheet from the legacy fleet app's, to avoid the two apps' writes colliding.
FLEET_SHEETS_KEYFILE = config('FLEET_SHEETS_KEYFILE', default='secrets/service-account.json')
FLEET_SHEET_ID = config('FLEET_SHEET_ID', default='')
# Issue/damage photos in Google Drive (fleet/drive.py). The token is written
# once by `manage.py drive_authorize`; without it photos stay on disk.
FLEET_DRIVE_CLIENT_SECRETS = config('FLEET_DRIVE_CLIENT_SECRETS', default='secrets/drive-oauth-client.json')
FLEET_DRIVE_TOKEN_FILE = config('FLEET_DRIVE_TOKEN_FILE', default='secrets/drive-token.json')
FLEET_DRIVE_ROOT_FOLDER = config('FLEET_DRIVE_ROOT_FOLDER', default='Fleet Maintenance Photos')
# Issue/damage photos in Google Drive (fleet/drive.py). Without this token
# file, NPD Tracker v2's one next door is used; with neither, photos stay on disk.
FLEET_DRIVE_TOKEN_FILE = config('FLEET_DRIVE_TOKEN_FILE', default='secrets/drive-token.json')
FLEET_DRIVE_ROOT_FOLDER = config('FLEET_DRIVE_ROOT_FOLDER', default='Fleet Maintenance Photos')
FLEET_SHEET_TAB = config('FLEET_SHEET_TAB', default='Fleet')

# One-time import source: the legacy fleet app's existing Google Sheet
# (read-only access needed — see fleet/management/commands/import_from_sheet.py).
FLEET_LEGACY_SHEET_ID = config('FLEET_LEGACY_SHEET_ID', default='')

# Google Sign-In (see .env.example) — dormant unless both are set, kept for
# parity with NPD Tracker; the shared login (accounts app) is the real path.
GOOGLE_OAUTH_CLIENT_ID = config('GOOGLE_OAUTH_CLIENT_ID', default='')
GOOGLE_ALLOWED_EMAIL = config('GOOGLE_ALLOWED_EMAIL', default='')


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'corsheaders',
    'accounts',
    'fleet',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_PAGINATION_CLASS': 'fleet.pagination.FleetPagination',
    'PAGE_SIZE': 25,
}

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS', default='http://localhost:5174', cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True

CSRF_TRUSTED_ORIGINS = config(
    'CSRF_TRUSTED_ORIGINS', default='http://localhost:5174', cast=Csv()
)

ROOT_URLCONF = 'fleet_maintenance.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'fleet_maintenance.wsgi.application'


# Database — Postgres is the real data store (replaces the legacy app's
# direct-to-Google-Sheets architecture).
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME', default='fleet_management'),
        'USER': config('DB_USER', default='fleet_maintenance'),
        'PASSWORD': config('DB_PASSWORD', default=''),
        'HOST': config('DB_HOST', default='127.0.0.1'),
        'PORT': config('DB_PORT', default='5432'),
    }
}


AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Australia/Sydney'
USE_I18N = True
USE_TZ = True


# Static files
STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'
STATICFILES_DIRS = (
    [('assets', FRONTEND_DIST / 'assets')] if (FRONTEND_DIST / 'assets').exists() else []
)

STORAGES = {
    'default': {
        'BACKEND': 'django.core.files.storage.FileSystemStorage',
    },
    'staticfiles': {
        'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
    },
}

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Uploaded documents (service invoices, rego papers, photos). Never served
# straight from disk: the API streams them to logged-in users only.
MEDIA_ROOT = config('MEDIA_ROOT', default=str(BASE_DIR / 'media'))
MEDIA_URL = '/api/media-not-served/'
