// Function to calculate dissolved oxygen value from raw reading
function calculateDO (rawReading: number) {
    return (rawReading - zeroOxygenOffset) * doScale
}
// Function to calculate checksum based on a numeric value
function calculateChecksum (value: number) {
    // Extract the ones digit from the absolute value of the number
    valueDigit = Math.abs(Math.round(value)) % 10
    // Simple checksum for single value - just use the ones digit
    return valueDigit
}
// Function to perform calibration
function calibrateDO () {
    isCalibrationMode = true
    isMeasurementMode = false
    // Step 1: Zero Oxygen Calibration (0% oxygen solution)
    basic.showString("0")
    // Wait for button A press to set zero oxygen point
    while (!(input.buttonIsPressed(Button.A))) {
        doRawReading = pins.analogReadPin(AnalogPin.P1)
        // Show the current raw reading scrolling across the screen
        basic.showNumber(doRawReading)
        basic.pause(100)
    }
    // Save zero oxygen offset
    zeroOxygenOffset = doRawReading
    // Show checkmark and pause
    basic.showIcon(IconNames.Yes)
    basic.pause(1000)
    // Step 2: Full Oxygen Calibration (100% oxygen solution)
    basic.showString("DO")
    // Wait for button B press to set full oxygen point
    while (!(input.buttonIsPressed(Button.B))) {
        doRawReading = pins.analogReadPin(AnalogPin.P1)
        // Show the current raw reading scrolling across the screen
        basic.showNumber(doRawReading)
        basic.pause(100)
    }
    // Save full oxygen reading
    fullOxygenReading = doRawReading
    // Calculate scale factor
    if (fullOxygenReading != zeroOxygenOffset) {
        doScale = fullOxygenValue / (fullOxygenReading - zeroOxygenOffset)
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
// Check for A+B press to enter calibration mode
input.onButtonPressed(Button.AB, function () {
    // Small delay to ensure it's a deliberate press
    basic.pause(500)
    if (input.buttonIsPressed(Button.A) && input.buttonIsPressed(Button.B)) {
        calibrateDO()
    }
})
let dataString = ""
let checksum = 0
let doValueInMgL = 0
let doRawReading = 0
let isCalibrationMode = false
let valueDigit = 0
let isMeasurementMode = false
let doScale = 0
let fullOxygenValue = 0
let fullOxygenReading = 0
let zeroOxygenOffset = 0
// Dissolved oxygen in mg/L
let valueDigit2 = 0
// Calibration variables with default values
// Analog reading when in 0% oxygen solution
zeroOxygenOffset = 512
// Analog reading when in 100% oxygen solution
fullOxygenReading = 712
// Approximate DO in mg/L in air-saturated water at 25°C
fullOxygenValue = 8.6
// Will be calculated during calibration
doScale = 0.01
isMeasurementMode = true
// Setup radio communication
// Changed from 144 to avoid conflicts
radio.setGroup(144)
radio.setTransmitPower(7)
// Show startup icon
basic.showIcon(IconNames.Square)
// Main measurement loop
basic.forever(function () {
    // Only run measurements when in measurement mode
    if (isMeasurementMode) {
        // Read the analog pin connected to the DO sensor (green wire)
        doRawReading = pins.analogReadPin(AnalogPin.P1)
        // Convert to DO value using calibration values
        doValueInMgL = calculateDO(doRawReading)
        // Show animation during reading
        basic.showIcon(IconNames.SmallSquare)
        // Calculate checksum
        checksum = calculateChecksum(doValueInMgL)
        // Format data string with DO value and checksum
        dataString = "" + convertToText(doValueInMgL) + "," + checksum
        // Send data over radio
        radio.sendString(dataString)
        // Display the DO value (rounded to one decimal place)
        basic.showNumber(Math.round(doValueInMgL * 10) / 10)
        basic.pause(200)
        // Show the standard icon again
        basic.showIcon(IconNames.Square)
        basic.pause(800)
    }
})
