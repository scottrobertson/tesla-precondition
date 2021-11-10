addEventListener('fetch', (event) => {
  event.respondWith(handleRequest(event.request))
})

/**
 * Main API Endpoint. Waits for car to wake up, and then sets the temprature and starts HVAC.
 * @param {Request} request
 */
async function handleRequest(request) {
  const accessToken = request.headers.get('X-Tesla-access_token')
  const vin = request.headers.get('X-Tesla-vin')
  const temperature = request.headers.get('X-Tesla-temp')
  const seats = request.headers.get('X-Tesla-seats')

  let successMessage = 'Car is preconditioning'

  try {
    console.log('Getting vehicle id and state')
    const { vehicleID, vehicleState } = await getVehicleIDAndStatusFromVin(accessToken, vin)

    if (vehicleState !== 'online') {
      console.log('Car is asleep, waking it up')
      await wakeVehicle(accessToken, vehicleID)
    } else {
      console.log('Car is already awake, skipping wake_up')
    }

    console.log('Starting HVAC')
    await startHVAC(accessToken, vehicleID)

    if (temperature) {
      console.log('Setting temprature')
      await setTemperature(accessToken, vehicleID, temperature)
      successMessage += ` to ${temperature}C`
    }

    // Enable seat heaters
    if (seats) {
      console.log('Setting seat levels')
      await Promise.all(
        seats.split(',').map(async (seatLevel, seatNumber) => {
          await setSeatHeater(accessToken, vehicleID, seatNumber, seatLevel)
        }),
      )
      successMessage += ', and the seats have been set.'
    }

    return jsonResponse(successMessage)
  } catch (errorMessage) {
    return jsonResponse('Error: ' + errorMessage)
  }
}

async function jsonResponse(message) {
  return new Response(JSON.stringify({ response: message }), {
    headers: { 'content-type': 'application/json' },
  })
}

async function getVehicleIDAndStatusFromVin(accessToken, vin) {
  if (vin === null) {
    throw 'No X-Tesla-vin header provided'
  }

  const vehiclesResponse = await teslaRequest(accessToken, null, 'GET', '/vehicles')
  const vehiclesJSON = await vehiclesResponse.json()
  const vehicle = vehiclesJSON.response.find((vehicle) => vehicle.vin === vin)

  if (vehicle) {
    return {
      vehicleID: vehicle.id_s,
      vehicleState: vehicle.state,
    }
  } else {
    throw 'Cannot find vehicle with that VIN'
  }
}

async function startHVAC(accessToken, vehicleID) {
  return await teslaRequest(accessToken, vehicleID, 'POST', '/command/auto_conditioning_start')
}

async function setTemperature(accessToken, vehicleID, temperature) {
  return await teslaRequest(accessToken, vehicleID, 'POST', '/command/set_temps', {
    driver_temp: temperature,
    passenger_temp: temperature,
  })
}

async function setSeatHeater(accessToken, vehicleID, seatNumber, seatLevel) {
  return await teslaRequest(accessToken, vehicleID, 'POST', '/command/remote_seat_heater_request', {
    heater: seatNumber,
    level: seatLevel,
  })
}

async function wakeVehicle(accessToken, vehicleID) {
  const wakeResponse = await teslaRequest(accessToken, vehicleID, 'POST', '/wake_up')
  return await wakeResponse.json()
}

async function teslaRequest(accessToken, vehicleID, method, url, body = null) {
  if (accessToken === null) {
    throw 'No access token provided'
  }

  const headers = new Headers()
  headers.set('Authorization', 'Bearer ' + accessToken)

  if (body !== null) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(body)
  }

  let fullUrl = null
  if (vehicleID === null && url === '/vehicles') {
    fullUrl = 'https://owner-api.teslamotors.com/api/1/vehicles/'
  } else {
    fullUrl = 'https://owner-api.teslamotors.com/api/1/vehicles/' + vehicleID + url
  }

  const request = new Request(fullUrl, {
    method: method,
    headers: headers,
    body: body,
  })

  let response = await performRequest(request, body)

  let retryCount = 1
  let retryMs = 1000
  let retryLimit = 60

  while (response.status === 408) {
    if (retryCount > retryLimit) {
      throw `Timed out waiting for car to wake up (${retryMs}ms).`
    }

    console.warn(`[Attempt: ${retryCount}/${retryLimit}] Car is sleeping, trying again in ${retryMs}ms`)
    await new Promise((r) => setTimeout(r, retryMs))

    response = await performRequest(request, body)

    retryCount += 1
  }

  if (response.status === 401) {
    throw 'Access Token invalid'
  }

  if (response.status === 200) {
    return response
  } else {
    throw `Invalid response from ${fullUrl}: [${response.status}] ` + (await response.text())
  }
}

async function performRequest(request, body) {
  const response = await fetch(request)
  const response_log = `[${request.method}] ${request.url}: ${body} => ${response.status}`

  if (response.status === 200) {
    console.log(response_log)
  } else {
    console.error(response_log)
  }

  return response
}
