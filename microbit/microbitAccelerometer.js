/**
 * Micro:bit Accelerometer with Checksum
 * 
 * For use with ChronoSense data acquisition application
 */
// Function to calculate checksum based on accelerometer values
function calculateChecksum (x: number, y: number, z: number) {
    // Use the modulo sum method - take the ones digit of each value and sum them
    // First, ensure we have integer values by rounding
    xRounded = Math.round(x)
    yRounded = Math.round(y)
    zRounded = Math.round(z)
    // Extract the ones digit from each value (get last digit using modulo 10)
    xDigit = Math.abs(xRounded) % 10
    yDigit = Math.abs(yRounded) % 10
    zDigit = Math.abs(zRounded) % 10
    // Sum the digits and take modulo 10 to get final checksum
    checksum = (xDigit + yDigit + zDigit) % 10
    return checksum
}
// Button A: Show X acceleration on screen
input.onButtonPressed(Button.A, function () {
    basic.showNumber(input.acceleration(Dimension.X))
})
// Buttons A+B: Show Z acceleration on screen
input.onButtonPressed(Button.AB, function () {
    basic.showNumber(input.acceleration(Dimension.Z))
})
// Button B: Show Y acceleration on screen
input.onButtonPressed(Button.B, function () {
    basic.showNumber(input.acceleration(Dimension.Y))
})
let dataString = ""
let zFormatted = 0
let yFormatted = 0
let xFormatted = 0
let checksum2 = 0
let z = 0
let y = 0
let x = 0
let checksum = 0
let zDigit = 0
let yDigit = 0
let xDigit = 0
let zRounded = 0
let yRounded = 0
let xRounded = 0
// Set up radio
radio.setGroup(139)
radio.setTransmitPower(7)
// Show checkmark on start
basic.showIcon(IconNames.Yes)
basic.pause(500)
basic.clearScreen()
// Main program loop
basic.forever(function () {
    // Read accelerometer values
    x = input.acceleration(Dimension.X)
    y = input.acceleration(Dimension.Y)
    z = input.acceleration(Dimension.Z)
    // Calculate checksum
    checksum2 = calculateChecksum(x, y, z)
    // Format values with fixed decimal places to avoid floating point issues
    xFormatted = Math.round(x)
    yFormatted = Math.round(y)
    zFormatted = Math.round(z)
    // Create data string with format: x,y,z,checksum
    dataString = "" + xFormatted + "," + yFormatted + "," + zFormatted + "," + checksum2
    // Send data over radio
    radio.sendString(dataString)
    // Show activity indicator
    led.toggle(2, 2)
    // Wait before next reading
    basic.pause(200)
})
