import os
from django.apps import AppConfig
from django.db.models.signals import post_migrate

def create_default_superuser(sender, **kwargs):
    from django.contrib.auth import get_user_model
    User = get_user_model()
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    if not User.objects.filter(username=username).exists():
        User.objects.create_superuser(username, f"{username}@guardianlink.app", password)
        print(f"✅ Automatically created superuser: {username}")

class AuthenticationConfig(AppConfig):
    name = 'authentication'

    def ready(self):
        post_migrate.connect(create_default_superuser, sender=self)
