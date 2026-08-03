from django.http import JsonResponse
from django.contrib.auth import get_user_model
import os

def force_create_admin(request):
    User = get_user_model()
    username = os.environ.get("ADMIN_USERNAME", "admin")
    password = os.environ.get("ADMIN_PASSWORD", "admin123")
    
    if User.objects.filter(username=username).exists():
        return JsonResponse({"status": "already_exists", "username": username})
        
    User.objects.create_superuser(username, f"{username}@guardianlink.app", password)
    return JsonResponse({"status": "created", "username": username})
