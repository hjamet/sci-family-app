import os
import sys
import json
from dotenv import load_dotenv

dotenv_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path)

username = os.getenv("VICARE_USERNAME")
password = os.getenv("VICARE_PASSWORD")
client_id = os.getenv("VICARE_CLIENT_ID", "b23ddfa2a01fd8e72d42a5afd22ef770")

print(f"=== PYVICARE LIVE ALL TEST ===")
print(f"Username: {username}")
print(f"Client ID: {client_id}")

if not username or not password:
    print("ERROR: Missing credentials")
    sys.exit(1)

try:
    from PyViCare.PyViCare import PyViCare
    vicare = PyViCare()
    token_file = os.path.join(os.path.dirname(__file__), "vicare_token.json")
    vicare.initWithCredentials(username, password, client_id, token_file)
    print("PyViCare initialized successfully.")
except Exception as e:
    print(f"ERROR: {e}")
    sys.exit(1)

results = {}

for idx, d_cfg in enumerate(vicare.devices):
    dev = d_cfg.asAutoDetectDevice()
    dev_name = f"device_{idx+1}_{dev.__class__.__name__}"
    dev_info = {}

    # Device level temperature methods
    for m in ["getOutsideTemperature", "getBoilerTemperature", "getDomesticHotWaterStorageTemperature"]:
        if hasattr(dev, m):
            try:
                dev_info[m] = {"value": getattr(dev, m)(), "error": None}
            except Exception as e:
                dev_info[m] = {"value": None, "error": str(e)}
        else:
            dev_info[m] = {"value": None, "error": "Not present"}

    # Circuits
    circuits_data = []
    if hasattr(dev, "circuits") and dev.circuits:
        for c_idx, circuit in enumerate(dev.circuits):
            c_dict = {"circuit_index": c_idx}
            
            # Direct calls
            for m in ["getRoomTemperature", "getSupplyTemperature", "getActiveProgram", "getActiveMode", "getCurrentDesiredTemperature", "getPrograms"]:
                if hasattr(circuit, m):
                    try:
                        c_dict[m] = {"value": getattr(circuit, m)(), "error": None}
                    except Exception as e:
                        c_dict[m] = {"value": None, "error": str(e)}
                else:
                    c_dict[m] = {"value": None, "error": "Not present"}

            # Program temperatures via getDesiredTemperatureForProgram(program)
            programs_temps = {}
            if hasattr(circuit, "getPrograms"):
                try:
                    progs = circuit.getPrograms()
                    for prog in progs:
                        if hasattr(circuit, "getDesiredTemperatureForProgram"):
                            try:
                                programs_temps[prog] = circuit.getDesiredTemperatureForProgram(prog)
                            except Exception as e:
                                programs_temps[prog] = f"ERROR: {e}"
                except Exception as e:
                    programs_temps["error"] = str(e)
            c_dict["program_temperatures"] = programs_temps

            circuits_data.append(c_dict)

    dev_info["circuits"] = circuits_data
    results[dev_name] = dev_info

print("\n=== RAW EMPIRICAL VI CARE API RESULTS ===")
print(json.dumps(results, indent=2, default=str))
