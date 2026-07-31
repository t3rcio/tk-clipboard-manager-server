
'''
Settings
'''
import os

STATIC_SALT_V1 = os.environ.get('STATIC_SALT_V1', b'some-aleatory-string-saved-on-env-vars')
SALT_ITER_HASH = 100_000