import os
import sys
import json
from dotenv import load_dotenv

# Load environment variables
dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path)

username = os.getenv("VICARE_USERNAME")
password = os.getenv("VICARE_PASSWORD")
client_id = os.getenv("VICARE_CLIENT_ID", "")
test_mode = os.getenv("VICARE_TEST_MODE_READ_ONLY", "True")

token_file = os.path.join(os.path.dirname(__file__), "vicare_token.json")

print("=" * 65)
print(" ViCare OAuth2 Connection Test (STRICT READ-ONLY MODE)")
print("=" * 65)
print(f"VICARE_USERNAME: {username}")
print(f"VICARE_PASSWORD: {'*' * len(password) if password else 'MISSING'}")
print(f"VICARE_CLIENT_ID: {client_id if client_id else '(None specified)'}")
print(f"VICARE_TEST_MODE_READ_ONLY: {test_mode}")
print(f"Token file path: {token_file}")
print("-" * 65)

if not username or not password:
    print("ERROR: VICARE_USERNAME or VICARE_PASSWORD is missing in .env")
    sys.exit(1)

try:
    import PyViCare
    from PyViCare.PyViCare import PyViCare as PyViCareClient
    from PyViCare.PyViCareUtils import (
        PyViCareInvalidCredentialsError,
        PyViCareRateLimitError,
        PyViCareDeviceCommunicationError,
        PyViCareInvalidConfigurationError,
    )
except ImportError as e:
    print(f"ERROR: PyViCare package import error: {e}")
    sys.exit(1)

print(f"PyViCare version: {getattr(PyViCare, '__version__', 'unknown')}")

try:
    vicare = PyViCareClient()
    print("Attempting OAuth2 authentication with ViCare API...")
    vicare.initWithCredentials(username, password, client_id, token_file)

    print("\nAUTHENTICATION SUCCESSFUL!")
    print("Fetching devices list from ViCare account...")
    
    devices = vicare.devices
    print(f"Found {len(devices)} device(s) registered under this account.\n")
    print("=" * 65)

    for idx, device_config in enumerate(devices):
        print(f"\n--- DEVICE #{idx + 1} ---")
        try:
            print(f"  Model Name : {device_config.getModel()}")
            print(f"  Is Online  : {device_config.isOnline()}")
        except Exception as dev_err:
            print(f"  Device info error: {dev_err}")

        accessor = device_config.asGeneric()
        
        # Comprehensive list of READ-ONLY getters
        telemetry_getters = [
            ("Outside Temperature", "getOutsideTemperature"),
            ("Supply Temperature", "getSupplyTemperature"),
            ("Boiler Temperature", "getBoilerTemperature"),
            ("Hot Water Storage Temp", "getDomesticHotWaterStorageTemperature"),
            ("Hot Water Configured Temp", "getDomesticHotWaterConfiguredTemperature"),
            ("Burner Active", "getBurnerActive"),
            ("Burner Hours", "getBurnerHours"),
            ("Burner Starts", "getBurnerStarts"),
            ("Active Program", "getActiveProgram"),
            ("Active Mode", "getActiveMode"),
        ]

        print("\n  Telemetry Data (Read-Only Queries):")
        for label, method_name in telemetry_getters:
            method = getattr(accessor, method_name, None)
            if callable(method):
                try:
                    val = method()
                    print(f"    - {label:<26}: {val}")
                except Exception as get_err:
                    print(f"    - {label:<26}: N/A ({get_err.__class__.__name__}: {get_err})")
            else:
                print(f"    - {label:<26}: Method not supported for device")

        # Also check circuits if available
        try:
            circuits = accessor.circuits
            print(f"\n  Heating Circuits ({len(circuits)} found):")
            for c_idx, circuit in enumerate(circuits):
                print(f"    Circuit #{c_idx + 1}:")
                for c_label, c_method in [
                    ("Circuit Supply Temp", "getSupplyTemperature"),
                    ("Circuit Room Temp", "getRoomTemperature"),
                    ("Heating Curve Shift", "getHeatingCurveShift"),
                    ("Heating Curve Slope", "getHeatingCurveSlope"),
                ]:
                    cm = getattr(circuit, c_method, None)
                    if callable(cm):
                        try:
                            print(f"      - {c_label:<22}: {cm()}")
                        except Exception as cm_err:
                            print(f"      - {c_label:<22}: N/A ({cm_err.__class__.__name__}: {cm_err})")
        except Exception as circ_err:
            print(f"  Circuits query note: {circ_err}")

except PyViCareInvalidCredentialsError as auth_err:
    print(f"\n[X] AUTHENTICATION FAILURE: Invalid ViCare credentials or OAuth rejected.")
    print(f"    Details: {auth_err}")
    sys.exit(2)
except PyViCareRateLimitError as rate_err:
    print(f"\n[X] RATE LIMIT FAILURE: ViCare API rate limit exceeded.")
    print(f"    Details: {rate_err}")
    sys.exit(3)
except PyViCareInvalidConfigurationError as cfg_err:
    print(f"\n[X] CONFIGURATION ERROR: Invalid configuration or missing Client ID.")
    print(f"    Details: {cfg_err}")
    sys.exit(4)
except Exception as ex:
    print(f"\n[X] CONNECTION / API ERROR: {ex.__class__.__name__}: {ex}")
    import traceback
    traceback.print_exc()
    sys.exit(5)

print("\n" + "=" * 65)
print(" ViCare READ-ONLY connection test execution completed.")
print("=" * 65)
