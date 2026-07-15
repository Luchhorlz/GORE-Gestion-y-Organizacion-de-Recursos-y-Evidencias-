import unittest

from backend.secure_store import protect_secret, unprotect_secret


class SecureStoreTests(unittest.TestCase):
    def test_windows_protection_roundtrip_does_not_store_plain_secret(self):
        secret = "gsk_example_only_not_a_real_key_123456789"
        encrypted = protect_secret(secret)
        self.assertNotIn(secret.encode("utf-8"), encrypted)
        self.assertEqual(unprotect_secret(encrypted), secret)
