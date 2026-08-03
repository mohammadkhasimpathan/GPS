import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'guardianlink.settings')
django.setup()

from django.contrib.auth import get_user_model

def setup():
    User = get_user_model()
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    if not User.objects.filter(username=username).exists():
        User.objects.create_superuser(username, f"{username}@guardianlink.app", password)
        print(f"✅ Automatically created superuser: {username}")
    else:
        print(f"ℹ️ Superuser {username} already exists.")

if __name__ == "__main__":
    setup()
