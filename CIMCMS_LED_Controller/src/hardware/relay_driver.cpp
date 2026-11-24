#include "hardware/relay_driver.h"
#include "hardware/pcf8574.h"
#include "device_config.h"
#include "config.h"

namespace {

uint8_t oddValue = 0xFF;
uint8_t evenValue = 0xFF;
bool oddReady = false;
bool evenReady = false;
bool states[16] = {false};

uint8_t addressFor(uint8_t channel) {
    return (channel & 1U) ? Devices::ODD_RELAY_PCF : Devices::EVEN_RELAY_PCF;
}

uint8_t bitFor(uint8_t channel) {
    return static_cast<uint8_t>((channel - 1U) / 2U);
}

bool validChannel(uint8_t channel) {
    return channel >= 1 && channel <= 16;
}

}

namespace RelayDriver {

bool begin() {
    oddValue = 0xFF;
    evenValue = 0xFF;
    for (uint8_t i = 0; i < 16; ++i) states[i] = false;

    if (RELAY_SIMULATION_MODE) {
        // Simulation backend: all 16 logical channels are available.
        oddReady = true;
        evenReady = true;
        return true;
    }

    oddReady = PCF8574::begin(Devices::ODD_RELAY_PCF, oddValue);
    evenReady = PCF8574::begin(Devices::EVEN_RELAY_PCF, evenValue);
    return oddReady && evenReady;
}

bool isAvailable(uint8_t channel) {
    if (!validChannel(channel)) return false;
    if (RELAY_SIMULATION_MODE) return true;
    return (channel & 1U) ? oddReady : evenReady;
}

bool set(uint8_t channel, bool on) {
    if (!isAvailable(channel)) return false;

    if (RELAY_SIMULATION_MODE) {
        states[channel - 1U] = on;
        uint8_t &bank = (channel & 1U) ? oddValue : evenValue;
        const uint8_t bit = bitFor(channel);
        const bool high = RELAY_ACTIVE_LOW ? !on : on;
        bank = high
            ? static_cast<uint8_t>(bank | (1U << bit))
            : static_cast<uint8_t>(bank & ~(1U << bit));
        return true;
    }

    const uint8_t bit = bitFor(channel);
    uint8_t &bank = (channel & 1U) ? oddValue : evenValue;
    const bool high = RELAY_ACTIVE_LOW ? !on : on;
    const uint8_t next = high
        ? static_cast<uint8_t>(bank | (1U << bit))
        : static_cast<uint8_t>(bank & ~(1U << bit));

    if (!PCF8574::write(addressFor(channel), next)) return false;
    bank = next;
    states[channel - 1U] = on;
    return true;
}

bool toggle(uint8_t channel) {
    if (!validChannel(channel)) return false;
    return set(channel, !states[channel - 1U]);
}

bool getState(uint8_t channel) {
    if (!validChannel(channel)) return false;
    return states[channel - 1U];
}

bool allOn() {
    if (RELAY_SIMULATION_MODE) {
        for (uint8_t i = 0; i < 16; ++i) states[i] = true;
        oddValue = RELAY_ACTIVE_LOW ? 0x00 : 0xFF;
        evenValue = RELAY_ACTIVE_LOW ? 0x00 : 0xFF;
        return true;
    }

    if (!oddReady || !evenReady) return false;
    const uint8_t onValue = RELAY_ACTIVE_LOW ? 0x00 : 0xFF;
    const bool oddOK = PCF8574::write(Devices::ODD_RELAY_PCF, onValue);
    const bool evenOK = PCF8574::write(Devices::EVEN_RELAY_PCF, onValue);
    if (!oddOK || !evenOK) {
        allOff();
        return false;
    }
    oddValue = onValue;
    evenValue = onValue;
    for (uint8_t i = 0; i < 16; ++i) states[i] = true;
    return true;
}

void allOff() {
    const uint8_t offValue = RELAY_ACTIVE_LOW ? 0xFF : 0x00;
    oddValue = offValue;
    evenValue = offValue;

    if (!RELAY_SIMULATION_MODE) {
        if (oddReady) PCF8574::write(Devices::ODD_RELAY_PCF, oddValue);
        if (evenReady) PCF8574::write(Devices::EVEN_RELAY_PCF, evenValue);
    }

    for (uint8_t i = 0; i < 16; ++i) states[i] = false;
}

uint8_t oddBankValue() { return oddValue; }
uint8_t evenBankValue() { return evenValue; }

}
