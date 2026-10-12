"""Fernet encryption of Google refresh tokens at rest (D-31)."""

from __future__ import annotations

from cryptography.fernet import Fernet, InvalidToken


class TokenDecryptError(Exception):
    pass


class TokenCipher:
    def __init__(self, key: str) -> None:
        self._fernet = Fernet(key.encode())

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode()).decode()
        except InvalidToken as exc:
            raise TokenDecryptError(
                "refresh token cannot be decrypted (wrong TOKEN_ENCRYPTION_KEY?)"
            ) from exc
