// Calculate checksum using modSum approach
function calculateChecksum(value: number) {
    // Extract ones digit of the value
    return Math.abs(Math.round(value)) % 10
}

// Setup variables
let magnetState = 0
let checksum = 0
let previousState = -1  // Track previous state to avoid duplicate messages

// Configure radio
radio.setGroup(136)
radio.setTransmitPower(7)

// Configure pin with pull-up resistor 
pins.setPull(DigitalPin.P1, PinPullMode.PullUp)

// KY-025 Digital Output Code (JavaScript)
// Connect KY-025 DO to Microbit pin 1
basic.forever(function () {
    // Read sensor state
    // NOTE: If using pull-up, a reed switch typically gives 0 when magnet is present
    // If using pull-down, it gives 1 when magnet is present
    magnetState = pins.digitalReadPin(DigitalPin.P1)

    // Check if we have a new state to report
    if (magnetState != previousState) {
        previousState = magnetState

        // Calculate checksum
        checksum = calculateChecksum(magnetState)

        // Send the data with the checksum appended
        radio.sendString("" + convertToText(magnetState) + "," + convertToText(checksum))

        // Provide visual feedback
        if (magnetState == 1) {
            basic.showLeds(`
                . . . . .
                . . . . .
                . . # . .
                . . . . .
                . . . . .
                `)
        } else {
            basic.showIcon(IconNames.No)
        }

        // Log to serial for debugging
        serial.writeString("Magnet State: " + magnetState + "\n")
    }

    // Short delay between readings
    basic.pause(100)
})
