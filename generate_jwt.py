#!/usr/bin/env python3
"""
JWT Token Generator for Trade API Testing
Generates a JWT bearer token for use in Bruno or other REST clients.

Usage:
    python generate_jwt.py
    
Environment Variables Required:
    JWT_SECRET: The secret key for signing the token (same as your Spring app)

Optional Environment Variables:
    USER_ID: Subject ID (default: "test-user")
    ACCOUNT_ID: Account ID (default: 1)
    ROLES: Comma-separated roles (default: "USER")
    TOKEN_EXPIRY_HOURS: Token expiry in hours (default: 24)
"""

import os
import sys
from datetime import datetime, timedelta, timezone

try:
    from jwt import encode as jwt_encode
except ImportError:
    print("Error: PyJWT is not installed.", file=sys.stderr)
    print("Install it with: pip install PyJWT", file=sys.stderr)
    sys.exit(1)


def get_env_var(name, default=None):
    """Get environment variable with optional default."""
    value = os.getenv(name, default)
    if value is None:
        print(f"Error: Environment variable '{name}' is not set", file=sys.stderr)
        sys.exit(1)
    return value


def generate_jwt_token():
    """Generate a JWT token for API testing."""
    
    # Get JWT secret from environment
    secret = get_env_var("JWT_SECRET")
    
    # Get optional configuration from environment variables
    user_id = os.getenv("USER_ID", "test-user")
    account_id = int(os.getenv("ACCOUNT_ID", "1"))
    roles = os.getenv("ROLES", "USER").split(",")
    expiry_hours = int(os.getenv("TOKEN_EXPIRY_HOURS", "24"))
    issuer = os.getenv("ISSUER", "trade-api-test")
    
    # Create payload
    now = datetime.now(timezone.utc)
    expiry = now + timedelta(hours=expiry_hours)
    
    payload = {
        "sub": user_id,
        "accountId": account_id,
        "roles": [role.strip() for role in roles],
        "iat": now,
        "exp": expiry,
        "iss": issuer,
    }
    
    # Generate token
    token = jwt_encode(payload, secret, algorithm="HS256")
    
    return token, payload


def main():
    """Main function."""
    try:
        token, payload = generate_jwt_token()
        
        print("\n" + "="*70)
        print("JWT TOKEN GENERATED SUCCESSFULLY")
        print("="*70)
        print(f"\nToken (expires in {payload['exp'].strftime('%Y-%m-%d %H:%M:%S UTC')}):")
        print(f"\n{token}\n")
        print("="*70)
        print("USE IN BRUNO:")
        print("="*70)
        print("Add the following header to your requests:\n")
        print(f"Authorization: Bearer {token}\n")
        print("="*70)
        print("TOKEN PAYLOAD:")
        print("="*70)
        for key, value in payload.items():
            if isinstance(value, datetime):
                print(f"  {key}: {value.strftime('%Y-%m-%d %H:%M:%S UTC')}")
            else:
                print(f"  {key}: {value}")
        print("="*70 + "\n")
        
    except Exception as e:
        print(f"Error generating token: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
