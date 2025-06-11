# core/serializers.py
import json
import ipaddress

from rest_framework import serializers
from .models import UserAgent, StreamProfile, CoreSettings, NETWORK_ACCESS


class UserAgentSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAgent
        fields = [
            "id",
            "name",
            "user_agent",
            "description",
            "is_active",
            "created_at",
            "updated_at",
        ]


class StreamProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = StreamProfile
        fields = [
            "id",
            "name",
            "command",
            "parameters",
            "is_active",
            "user_agent",
            "locked",
        ]


class CoreSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = CoreSettings
        fields = "__all__"

    def update(self, instance, validated_data):
        if instance.key == NETWORK_ACCESS:
            errors = False
            invalid = {}
            value = json.loads(validated_data.get("value"))
            for key, val in value.items():
                cidrs = val.split(",")
                for cidr in cidrs:
                    try:
                        ipaddress.ip_network(cidr)
                    except:
                        errors = True
                        if key not in invalid:
                            invalid[key] = []
                        invalid[key].append(cidr)

            if errors:
                # Perform CIDR validation
                raise serializers.ValidationError(
                    {
                        "message": "Invalid CIDRs",
                        "value": invalid,
                    }
                )

        return super().update(instance, validated_data)
