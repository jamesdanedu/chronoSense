// Calculate checksum using modSum approach
function calculateChecksum (value: number) {
    // Extract ones digit of the value
    return Math.abs(Math.round(value)) % 10
}
input.onButtonPressed(Button.A, function () {
    objectCount = 0
})
let checksum = 0
let lastState = 0
let currentState = 0
let objectCount = 0
radio.setGroup(133)
objectCount = 0
basic.forever(function () {
    currentState = pins.digitalReadPin(DigitalPin.P0)
    // Check for a state change from unbroken to broken
    // This indicates an object has passed through the beam
    if (currentState == 0 && lastState == 1) {
        objectCount += 1
        basic.showLeds(`
            . . . . .
            . . . . .
            # # . # #
            . . . . .
            . . . . .
            `)
        // Calculate checksum - just the ones digit of objectCount in this simple case
        checksum = calculateChecksum(objectCount)
        // Send the data with the checksum appended
        radio.sendString("" + convertToText(objectCount) + "," + convertToText(checksum))
    } else {
        basic.showLeds(`
            . . . . .
            . . . . .
            # # # # #
            . . . . .
            . . . . .
            `)
    }
    lastState = currentState
    basic.pause(100)
})
