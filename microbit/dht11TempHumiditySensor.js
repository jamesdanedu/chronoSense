// Function to validate humidity is in reasonable range
function validateHumidity (humid: number) {
    return humid >= 10 && humid <= 100
}
// Function to read data from DHT11 sensor with extended reliability
function readDHT11 () {
    // Initial setup and start signal
    pins.digitalWritePin(DigitalPin.P0, 1)
    // Make sure pin is high before we start
    basic.pause(5)
    pins.digitalWritePin(DigitalPin.P0, 0)
    // Increased from 20ms to 25ms for more reliable response
    basic.pause(25)
    pins.digitalWritePin(DigitalPin.P0, 1)
    control.waitMicros(40)
    // Changed to PullUp for more reliable readings
    pins.setPull(DigitalPin.P0, PinPullMode.PullUp)
    // Wait for DHT11 response with timeout
    timeoutCounter = 0
    while (pins.digitalReadPin(DigitalPin.P0) == 1) {
        timeoutCounter += 1
        // Increased from 1 to 2 microseconds
        control.waitMicros(2)
        if (timeoutCounter > 200) {
            // Increased timeout threshold
            return false
        }
    }
    timeoutCounter = 0
    while (pins.digitalReadPin(DigitalPin.P0) == 0) {
        timeoutCounter += 1
        control.waitMicros(2)
        if (timeoutCounter > 200) {
            return false
        }
    }
    timeoutCounter = 0
    while (pins.digitalReadPin(DigitalPin.P0) == 1) {
        timeoutCounter += 1
        control.waitMicros(2)
        if (timeoutCounter > 200) {
            return false
        }
    }
    // Read 40 bits of data (5 bytes)
    dataArray = []
    for (let index = 0; index < 40; index++) {
        // Wait for pin to go high (start of bit) with timeout
        timeoutCounter = 0
        while (pins.digitalReadPin(DigitalPin.P0) == 0) {
            timeoutCounter += 1
            control.waitMicros(1)
            if (timeoutCounter > 150) {
                // Increased timeout threshold
                return false
            }
        }
        // Measure high time to determine if bit is 0 or 1
        startTime = input.runningTimeMicros()
        // Wait for pin to go low with timeout
        timeoutCounter = 0
        while (pins.digitalReadPin(DigitalPin.P0) == 1) {
            timeoutCounter += 1
            control.waitMicros(1)
            if (timeoutCounter > 150) {
                break;
            }
        }
        endTime = input.runningTimeMicros()
        signalLength = endTime - startTime
        // If high time is longer than 40μs, bit is 1, otherwise 0
        if (signalLength > 40) {
            dataArray.push(1)
        } else {
            dataArray.push(0)
        }
    }
    // Make sure we got enough bits
    if (dataArray.length < 40) {
        return false
    }
    // Convert bits to bytes
    bytes = [
    0,
    0,
    0,
    0,
    0
    ]
    for (let j = 0; j <= 4; j++) {
        for (let k = 0; k <= 7; k++) {
            bytes[j] = bytes[j] << 1
            bytes[j] = bytes[j] | dataArray[j * 8 + k]
        }
    }
    // Verify checksum
    checksumOK = bytes[4] == ((bytes[0] + bytes[1] + bytes[2] + bytes[3]) & 0xFF)
    // Validate readings are in reasonable range
    if (checksumOK && bytes[0] <= 100 && bytes[2] <= 80 && bytes[0] > 0 && bytes[2] > 0) {
        // Update temperature and humidity values
        humidity = bytes[0]
        temperature = bytes[2]
        // Reset failure count on success
        failureCount = 0
        return true
    } else {
        return false
    }
}
// Function to validate temperature is in reasonable range
function validateTemperature (temp: number) {
    return temp >= 0 && temp <= 50
}
let checksum3 = 0
let humString3 = ""
let tempString3 = ""
let checksum2 = 0
let humString2 = ""
let tempString2 = ""
let dataString = ""
let checksum = 0
let humString = ""
let tempString = ""
let lastGoodHumidity = 0
let lastGoodTemp = 0
let humidValid = false
let tempValid = false
let success = false
let failureCount = 0
let temperature = 0
let humidity = 0
let checksumOK = false
let signalLength = 0
let endTime = 0
let startTime = 0
let timeoutCounter = 0
let dataArray: number[] = []
let bytes: number[] = []
// Set up radio
radio.setGroup(137)
// Main program loop
basic.forever(function () {
    // Show status
    if (failureCount > 5) {
        // Show special icon for repeated failures
        basic.showIcon(IconNames.Skull)
    } else {
        // Show heart while collecting data
        basic.showIcon(IconNames.Heart)
    }
    // Try to read from DHT11
    success = readDHT11()
    if (success) {
        // Validate sensor readings
        tempValid = validateTemperature(temperature)
        humidValid = validateHumidity(humidity)
        if (tempValid && humidValid) {
            // Store valid readings for future use
            lastGoodTemp = temperature
            lastGoodHumidity = humidity
            // Format values using simple string approach to avoid floating point issues
            tempString = "" + temperature
            humString = "" + Math.floor(humidity / 10) + "." + humidity % 10
            // Use a simple checksum to verify data integrity (sum of first digits)
            checksum = temperature % 10 + Math.floor(humidity / 10) % 10
            // Create data string with format: temp,humidity,checksum
            dataString = "" + tempString + "," + humString + "," + checksum
            // Send data over radio
            radio.sendString(dataString)
            // Indicate success
            basic.showIcon(IconNames.Yes)
            basic.pause(200)
            // Display the temperature briefly
            basic.showNumber(temperature)
            basic.pause(500)
        } else {
            // Invalid reading - use previous good values if available
            if (lastGoodTemp > 0 && lastGoodHumidity > 0) {
                // Format using last good values
                tempString2 = "" + lastGoodTemp
                humString2 = "" + Math.floor(lastGoodHumidity / 10) + "." + lastGoodHumidity % 10
                checksum2 = lastGoodTemp % 10 + Math.floor(lastGoodHumidity / 10) % 10
                dataString = "" + tempString2 + "," + humString2 + "," + checksum2
                radio.sendString(dataString)
                // Show different icon for using previous value
                basic.showIcon(IconNames.Diamond)
                basic.pause(200)
            } else {
                // No previous good values
                failureCount += 1
                basic.showIcon(IconNames.No)
                basic.pause(200)
            }
        }
    } else {
        // Reading failed
        failureCount += 1
        // If we have previous good readings, use those
        if (lastGoodTemp > 0 && lastGoodHumidity > 0 && failureCount < 10) {
            // Format using last good values
            tempString3 = "" + lastGoodTemp
            humString3 = "" + Math.floor(lastGoodHumidity / 10) + "." + lastGoodHumidity % 10
            checksum3 = lastGoodTemp % 10 + Math.floor(lastGoodHumidity / 10) % 10
            dataString = "" + tempString3 + "," + humString3 + "," + checksum3
            radio.sendString(dataString)
            // Show different icon for using previous value
            basic.showIcon(IconNames.Diamond)
            basic.pause(200)
        } else {
            // Indicate failed reading with no backup data
            basic.showIcon(IconNames.No)
            basic.pause(200)
        }
    }
    // Clear display between readings
    basic.clearScreen()
    // Wait before next reading (DHT11 needs at least 1 second between readings)
    basic.pause(1500)
})
