// Function to convert voltage to pH value
function readPh () {
    // Get voltage
    voltage2 = readVoltage()
    // Convert voltage to pH using calibration values
    phValue = PH_OFFSET - (voltage2 - 2.5) / SCALE_FACTOR
    // Limit range to valid pH values (0-14)
    phValue = Math.max(0, Math.min(14, phValue))
    return phValue
}
// Function to read voltage from the pH sensor
function readVoltage () {
    // Read analog value (0-1023)
    rawValue = pins.analogReadPin(AnalogPin.P0)
    // Convert to voltage (0-3.3V)
    voltage = rawValue / 1023 * 3.3
    return voltage
}
// Button A handler - Enter calibration mode
input.onButtonPressed(Button.A, function () {
    if (!(is_calibrating)) {
        is_calibrating = true
        is_selecting_ph = true
        basic.showString("Cal")
        basic.showString("Set pH")
        showNumberScrolling(calibration_ph)
    } else if (is_selecting_ph) {
        // Increase pH value with button A
        calibration_ph = Math.min(14, calibration_ph + 0.1)
        showNumberScrolling(calibration_ph)
    }
})
// Function to display a number with one decimal place
function showNumberScrolling (num: number) {
    // Format number to 1 decimal place and scroll
    basic.showString("" + (Math.round(num * 10) / 10))
}
// Button A+B handler - Confirm selection and handle calibration
input.onButtonPressed(Button.AB, function () {
    if (is_selecting_ph) {
        is_selecting_ph = false
        basic.showString("Reading")
        // Start voltage measurement for calibration
        voltage3 = readVoltage()
        basic.showString("V:")
        showNumberScrolling(voltage3)
        // Update calibration values after voltage is measured
        // Assume 2.5V is the midpoint (pH 7)
        PH_OFFSET = calibration_ph
        // Avoid division by zero
        if (calibration_ph != 7) {
            newScale = Math.abs((voltage3 - 2.5) / (calibration_ph - 7))
            // If scale factor seems reasonable, use it
            if (newScale >= 0.1 && newScale <= 5 && !(isNaN(newScale))) {
                SCALE_FACTOR = newScale
            }
        }
        // Show calibration complete
        basic.showString("Cal OK")
        // Exit calibration mode
        is_calibrating = false
    }
})
// Button B handler - Decrease pH value in calibration mode
input.onButtonPressed(Button.B, function () {
    if (is_selecting_ph) {
        calibration_ph = Math.max(0, calibration_ph - 0.1)
        showNumberScrolling(calibration_ph)
    }
})
let ph = 0
let newScale = 0
let voltage3 = 0
let is_selecting_ph = false
let is_calibrating = false
let voltage = 0
let rawValue = 0
let phValue = 0
let voltage2 = 0
let calibration_ph = 0
let SCALE_FACTOR = 0
let PH_OFFSET = 0
// Pin connections
// Connect yellow wire (sensor output) to pin0
let PH_PIN = 0
// Constants for pH calculation
// These will be updated during calibration
// pH at 0V differential
PH_OFFSET = 7
// Conversion factor
SCALE_FACTOR = 1.75
// Calibration data
// Default calibration pH value
calibration_ph = 7
// Display welcome message
basic.showString("pH Meter")
radio.setGroup(143)
radio.setTransmitPower(7)
// Main event handlers and loops
basic.forever(function () {
    // Normal pH reading mode
    if (!(is_calibrating)) {
        // Read pH
        ph = readPh()
        // Display pH
        showNumberScrolling(ph)
        radio.sendString(convertToText(ph))
        // Brief delay
        basic.pause(2000)
    }
})
