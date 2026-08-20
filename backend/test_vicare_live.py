import contextlib
import sys
from PyViCare.PyViCare import PyViCare

def main():
    print("Initializing PyViCare with credentials...")
    vicare = PyViCare()
    vicare.initWithCredentials("frdjamet@gmail.com", "vies1189@", "b23ddfa2a01fd8e72d42a5afd22ef770", "token.save")

    if not vicare.devices:
        print("No ViCare devices found!")
        return

    print(f"Number of devices found: {len(vicare.devices)}")

    boiler_device = None
    circuit = None

    for idx, d_cfg in enumerate(vicare.devices):
        dev = d_cfg.asAutoDetectDevice()
        print(f"\nDevice #{idx}: {dev.__class__.__name__} ({dev})")
        if hasattr(dev, 'circuits') and dev.circuits:
            boiler_device = dev
            circuit = dev.circuits[0]
            print(f" -> Found Boiler Device with {len(dev.circuits)} circuit(s)!")

    # Fallback to index 0 if no circuits found
    if not boiler_device:
        boiler_device = vicare.devices[0].asAutoDetectDevice()
        if hasattr(boiler_device, 'circuits') and boiler_device.circuits:
            circuit = boiler_device.circuits[0]

    print("\n" + "="*50)
    print("--- EMPIRICAL TELEMETRY RESULTS (READ-ONLY) ---")
    print("="*50)

    # 1. getOutsideTemperature
    outside_temp = None
    with contextlib.suppress(Exception):
        outside_temp = boiler_device.getOutsideTemperature()
    print(f"getOutsideTemperature(): {outside_temp}")

    # 2. getRoomTemperature
    room_temp = None
    if circuit:
        with contextlib.suppress(Exception):
            room_temp = circuit.getRoomTemperature()
    if room_temp is None:
        for d_cfg in vicare.devices:
            dev = d_cfg.asAutoDetectDevice()
            with contextlib.suppress(Exception):
                room_temp = dev.getRoomTemperature()
                if room_temp is not None:
                    print(f"getRoomTemperature() [from {dev.__class__.__name__}]: {room_temp}")
                    break
    else:
        print(f"circuit.getRoomTemperature(): {room_temp}")

    # 3. getSupplyTemperature
    supply_temp = None
    if circuit:
        with contextlib.suppress(Exception):
            supply_temp = circuit.getSupplyTemperature()
    print(f"circuit.getSupplyTemperature(): {supply_temp}")

    # 4. getActiveMode
    active_mode = None
    if circuit:
        with contextlib.suppress(Exception):
            active_mode = circuit.getActiveMode()
    print(f"circuit.getActiveMode(): {active_mode}")

    # Additional telemetry read-only checks
    with contextlib.suppress(Exception):
        boiler_temp = boiler_device.getBoilerTemperature()
        print(f"boiler_device.getBoilerTemperature(): {boiler_temp}")

    with contextlib.suppress(Exception):
        dhw_temp = boiler_device.getDomesticHotWaterStorageTemperature()
        print(f"boiler_device.getDomesticHotWaterStorageTemperature(): {dhw_temp}")

if __name__ == "__main__":
    main()

