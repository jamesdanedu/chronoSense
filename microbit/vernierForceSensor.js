/**
 * Vernier Force Sensor Interface for Micro:bit
 * 
 * Wire connections:
 * 
 * - Red: Power (typically 5V)
 * 
 * - Blue: Ground
 * 
 * - Brown: Analog output signal
 * 
 * - Orange: I2C or additional signal (unused in this implementation)
 * 
 * Calibration Instructions:
 * 
 * 1. On startup, the device enters measurement mode.
 * 
 * 2. Press and hold both A+B buttons to enter calibration mode.
 * 
 * 3. When "0" is displayed, ensure no force is applied and press A to set zero point.
 * 
 * 4. When "F" is displayed, apply a known reference force (default 9.8N) and press B.
 * 
 * 5. The device will calculate calibration values and return to measurement mode.
 */
/**
 * Variables
 */
/**
 * Mode flags
 */
// Function to calculate checksum based on a numeric value
function calculateChecksum (value: number) {
    // Extract the ones digit from the absolute value of the number
    valueDigit = Math.abs(Math.round(value)) % 10
    // Simple checksum for single value - just use the ones digit
    return valueDigit
}
// Function to calculate force value from raw reading
function calculateForce (rawReading: number) {
    // Invert the calculation to make pulling down register as positive
    return (zeroForceOffset - rawReading) * forceScale
}
// Check for A+B press to enter calibration mode
input.onButtonPressed(Button.AB, function () {
    // Small delay to ensure it's a deliberate press
    basic.pause(500)
    if (input.buttonIsPressed(Button.A) && input.buttonIsPressed(Button.B)) {
        calibrateForce()
    }
})
// Function to perform calibration
function calibrateForce () {
    isCalibrationMode = true
    isMeasurementMode = false
    // Step 1: Zero Force Calibration
    basic.showString("0")
    // Wait for button A press to set zero force point
    while (!(input.buttonIsPressed(Button.A))) {
        forceRawReading = pins.analogReadPin(AnalogPin.P1)
        // Show the current raw reading scrolling across the screen
        basic.showNumber(forceRawReading)
        basic.pause(100)
    }
    // Save zero force offset
    zeroForceOffset = forceRawReading
    // Show checkmark and pause
    basic.showIcon(IconNames.Yes)
    basic.pause(1000)
    // Step 2: Reference Force Calibration
    basic.showString("F")
    // Wait for button B press to set reference force point
    while (!(input.buttonIsPressed(Button.B))) {
        forceRawReading = pins.analogReadPin(AnalogPin.P1)
        // Show the current raw reading scrolling across the screen
        basic.showNumber(forceRawReading)
        basic.pause(100)
    }
    // Save reference force reading
    referenceForceReading = forceRawReading
    // Calculate scale factor
    if (referenceForceReading != zeroForceOffset) {
        forceScale = referenceForceValue / (referenceForceReading - zeroForceOffset)
    }
    // Show double checkmark to indicate calibration is complete
    basic.showIcon(IconNames.Yes)
    basic.pause(500)
    basic.showIcon(IconNames.Yes)
    basic.pause(500)
    // Return to measurement mode
    isCalibrationMode = false
    isMeasurementMode = true
}
let dataString = ""
let checksum = 0
let forceValueInNewtons = 0
let forceRawReading = 0
let isCalibrationMode = false
let valueDigit = 0
let isMeasurementMode = false
let forceScale = 0
let referenceForceValue = 0
let referenceForceReading = 0
let zeroForceOffset = 0
let valueDigit2 = 0
// Calibration variables with default values
// Analog reading when no force is applied
zeroForceOffset = 512
// Analog reading when reference force is applied
referenceForceReading = 712
// Reference force in Newtons (default: ~100g)
referenceForceValue = 1
// Will be calculated during calibration
forceScale = 0.01
isMeasurementMode = true
// Setup radio communication
radio.setGroup(140)
radio.setTransmitPower(7)
// Show startup icon
basic.showIcon(IconNames.Square)
// Main measurement loop
basic.forever(function () {
    // Only run measurements when in measurement mode
    if (isMeasurementMode) {
        // Read the analog pin connected to the force sensor (brown wire)
        forceRawReading = pins.analogReadPin(AnalogPin.P1)
        // Convert to force using calibration values
        forceValueInNewtons = calculateForce(forceRawReading)
        // Show animation during reading
        basic.showIcon(IconNames.SmallSquare)
        // Calculate checksum
        checksum = calculateChecksum(forceValueInNewtons)
        // Format data string with force value and checksum
        dataString = "" + convertToText(forceValueInNewtons) + "," + checksum
        // Send data over radio
        radio.sendString(dataString)
        // Display the force value (rounded to one decimal place)
        basic.showNumber(Math.round(forceValueInNewtons * 10) / 10)
        basic.pause(200)
        // Show the standard icon again
        basic.showIcon(IconNames.Square)
        basic.pause(800)
    }
})
