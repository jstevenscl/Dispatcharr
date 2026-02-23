from django.test import TestCase, RequestFactory
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status

User = get_user_model()


class InitializeSuperuserTests(TestCase):
    """Tests for the initialize_superuser endpoint"""

    def setUp(self):
        self.client = APIClient()
        self.url = "/api/accounts/initialize-superuser/"

    def test_returns_true_when_superuser_exists(self):
        """Superuser with is_superuser=True should be detected"""
        User.objects.create_superuser(
            username="admin", password="testpass123", user_level=10
        )
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["superuser_exists"])

    def test_returns_true_when_admin_level_user_exists(self):
        """User with user_level=10 but is_superuser=False should be detected"""
        user = User.objects.create_user(username="admin", password="testpass123")
        user.user_level = 10
        user.is_superuser = False
        user.save()
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["superuser_exists"])

    def test_returns_false_when_no_admin_exists(self):
        """No admin or superuser should return false"""
        # Create a non-admin user
        User.objects.create_user(username="regular", password="testpass123")
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["superuser_exists"])

    def test_returns_false_when_no_users_exist(self):
        """Empty database should return false"""
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["superuser_exists"])

    def test_create_superuser_when_none_exists(self):
        """POST should create superuser when none exists"""
        response = self.client.post(
            self.url,
            {"username": "newadmin", "password": "testpass123", "email": "admin@test.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["superuser_exists"])
        self.assertTrue(User.objects.filter(username="newadmin", user_level=10).exists())

    def test_cannot_create_superuser_when_admin_exists(self):
        """POST should fail when an admin-level user already exists"""
        user = User.objects.create_user(username="existing", password="testpass123")
        user.user_level = 10
        user.save()
        response = self.client.post(
            self.url,
            {"username": "newadmin", "password": "testpass123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["superuser_exists"])
        # Should NOT have created a new user
        self.assertFalse(User.objects.filter(username="newadmin").exists())


class TokenRefreshDisabledUserTests(TestCase):
    """Tests for blocking token refresh on disabled users"""

    def setUp(self):
        self.client = APIClient()
        self.token_url = "/api/accounts/token/"
        self.refresh_url = "/api/accounts/token/refresh/"

    def test_refresh_works_for_active_user(self):
        """Active user should be able to refresh their token"""
        user = User.objects.create_user(username="active", password="testpass123")
        user.user_level = 1
        user.is_active = True
        user.save()

        # Get tokens
        login_response = self.client.post(
            self.token_url,
            {"username": "active", "password": "testpass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        refresh_token = login_response.data["refresh"]

        # Refresh should succeed
        refresh_response = self.client.post(
            self.refresh_url,
            {"refresh": refresh_token},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn("access", refresh_response.data)

    def test_refresh_blocked_for_disabled_user(self):
        """Disabled user should not be able to refresh their token"""
        user = User.objects.create_user(username="disabled", password="testpass123")
        user.user_level = 1
        user.is_active = True
        user.save()

        # Get tokens while user is active
        login_response = self.client.post(
            self.token_url,
            {"username": "disabled", "password": "testpass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        refresh_token = login_response.data["refresh"]

        # Disable the user
        user.is_active = False
        user.save()

        # Refresh should be blocked
        refresh_response = self.client.post(
            self.refresh_url,
            {"refresh": refresh_token},
            format="json",
        )
        self.assertEqual(refresh_response.status_code, 403)


class LastAdminProtectionTests(TestCase):
    """Tests for preventing disabling the last active admin"""

    def setUp(self):
        self.admin = User.objects.create_user(username="admin1", password="testpass123")
        self.admin.user_level = 10
        self.admin.save()

        self.client = APIClient()
        self.client.force_authenticate(user=self.admin)

    def test_cannot_disable_last_admin(self):
        """Should reject disabling the only active admin"""
        response = self.client.patch(
            f"/api/accounts/users/{self.admin.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("is_active", response.data)

        # Verify admin is still active
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_can_disable_admin_when_another_exists(self):
        """Should allow disabling an admin when another active admin exists"""
        admin2 = User.objects.create_user(username="admin2", password="testpass123")
        admin2.user_level = 10
        admin2.save()

        response = self.client.patch(
            f"/api/accounts/users/{admin2.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        admin2.refresh_from_db()
        self.assertFalse(admin2.is_active)

    def test_can_disable_non_admin_user(self):
        """Should always allow disabling non-admin users"""
        regular = User.objects.create_user(username="regular", password="testpass123")
        regular.user_level = 1
        regular.save()

        response = self.client.patch(
            f"/api/accounts/users/{regular.id}/",
            {"is_active": False},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        regular.refresh_from_db()
        self.assertFalse(regular.is_active)

    def test_can_reenable_disabled_user(self):
        """Should allow re-enabling a disabled user"""
        regular = User.objects.create_user(username="disabled", password="testpass123")
        regular.user_level = 1
        regular.is_active = False
        regular.save()

        response = self.client.patch(
            f"/api/accounts/users/{regular.id}/",
            {"is_active": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        regular.refresh_from_db()
        self.assertTrue(regular.is_active)


class DisabledUserLoginTests(TestCase):
    """Tests that disabled users cannot log in"""

    def setUp(self):
        self.client = APIClient()
        self.token_url = "/api/accounts/token/"

    def test_disabled_user_cannot_login(self):
        """Disabled user should get rejected at login"""
        user = User.objects.create_user(username="disabled", password="testpass123")
        user.is_active = False
        user.save()

        response = self.client.post(
            self.token_url,
            {"username": "disabled", "password": "testpass123"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_active_user_can_login(self):
        """Active user should be able to log in"""
        user = User.objects.create_user(username="active", password="testpass123")
        user.is_active = True
        user.save()

        response = self.client.post(
            self.token_url,
            {"username": "active", "password": "testpass123"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)


class DisabledUserAccessTokenTests(TestCase):
    """Tests that a disabled user's existing access token is rejected on authenticated endpoints"""

    def setUp(self):
        self.client = APIClient()
        self.token_url = "/api/accounts/token/"
        self.users_url = "/api/accounts/users/"

    def test_existing_token_rejected_after_disable(self):
        """Access token obtained while active should be rejected after user is disabled"""
        user = User.objects.create_user(username="willdisable", password="testpass123")
        user.user_level = 10  # Admin so they can access the users endpoint
        user.is_active = True
        user.save()

        # Get tokens while user is active
        login_response = self.client.post(
            self.token_url,
            {"username": "willdisable", "password": "testpass123"},
            format="json",
        )
        self.assertEqual(login_response.status_code, 200)
        access_token = login_response.data["access"]

        # Verify token works while active
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access_token}")
        response = self.client.get(self.users_url)
        self.assertEqual(response.status_code, 200)

        # Disable the user
        user.is_active = False
        user.save()

        # Same token should now be rejected
        response = self.client.get(self.users_url)
        self.assertIn(response.status_code, [401, 403])