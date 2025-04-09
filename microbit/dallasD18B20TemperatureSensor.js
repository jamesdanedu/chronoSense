dstemp.sensorError(function (errorMessage, errorCode, port) {
    basic.showString("" + errorMessage + ":" + errorCode)
})
// Function to calculate checksum based on temperature value
function calculateChecksum (temperature: number) {
    // Extract the ones digit from temperature (get last digit using modulo 10)
    // For negative temperatures, use absolute value first
    tempDigit = Math.abs(Math.round(temperature)) % 10
    // Simple checksum for single value - just use the ones digit
    return tempDigit
}
let dataString = ""
let checksum = 0
let temp = 0
let tempDigit = 0
radio.setGroup(136)
radio.setTransmitPower(7)
basic.showIcon(IconNames.Diamond)
basic.forever(function () {
    temp = dstemp.celsius(DigitalPin.P0)
    basic.showNumber(temp)
    // Only send valid temperature readings
    if (temp > -10 && temp < 100) {
        // Calculate checksum
        checksum = calculateChecksum(temp)
        // Format data string with temperature and checksum
        dataString = "" + convertToText(temp) + "," + checksum
        // Send data over radio
        radio.sendString(dataString)
    }
    basic.pause(5000)
})
