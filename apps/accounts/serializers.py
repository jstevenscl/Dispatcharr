from rest_framework import serializers
from django.contrib.auth.models import Group, Permission
from .models import User
from apps.channels.models import ChannelProfile


# 🔹 Fix for Permission serialization
class PermissionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Permission
        fields = ["id", "name", "codename"]


# 🔹 Fix for Group serialization
class GroupSerializer(serializers.ModelSerializer):
    permissions = serializers.PrimaryKeyRelatedField(
        many=True, queryset=Permission.objects.all()
    )  # ✅ Fixes ManyToManyField `_meta` error

    class Meta:
        model = Group
        fields = ["id", "name", "permissions"]


# 🔹 Fix for User serialization
class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)
    channel_profiles = serializers.PrimaryKeyRelatedField(
        queryset=ChannelProfile.objects.all(), many=True, required=False
    )

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "user_level",
            "password",
            "channel_profiles",
            "custom_properties",
            "avatar_config",
            "is_active",
            "is_staff",
            "is_superuser",
            "last_login",
            "date_joined",
            "first_name",
            "last_name",
        ]

    def create(self, validated_data):
        channel_profiles = validated_data.pop("channel_profiles", [])

        is_active = validated_data.pop("is_active", True)
        user = User(**validated_data)
        user.set_password(validated_data["password"])
        user.is_active = is_active
        user.save()

        user.channel_profiles.set(channel_profiles)

        return user

    def update(self, instance, validated_data):
        # Prevent disabling the last active admin account
        if 'is_active' in validated_data and not validated_data['is_active']:
            other_active_admins = User.objects.filter(
                user_level__gte=10,
                is_active=True
            ).exclude(id=instance.id).exists()
            if not other_active_admins:
                raise serializers.ValidationError(
                    {"is_active": "Cannot disable the last active admin account."}
                )

        password = validated_data.pop("password", None)
        channel_profiles = validated_data.pop("channel_profiles", None)

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if password:
            instance.set_password(password)

        instance.save()

        if channel_profiles is not None:
            instance.channel_profiles.set(channel_profiles)

        return instance
