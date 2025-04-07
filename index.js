const fs = require('fs');
const axios = require('axios');

// קריאת קבצי JSON
function loadJsonFile(filename) {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
}

// חישוב מרחק וזמן נסיעה באמצעות OSRM
async function getDistanceAndTime(from, to) {
    const url = `http://router.project-osrm.org/route/v1/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=false`;
    try {
        const response = await axios.get(url);
        const route = response.data.routes[0];
        return { distance: route.distance / 1000, duration: route.duration / 60 }; // ק"מ ודקות
    } catch (error) {
        console.error("Error fetching distance:", error);
        return { distance: Infinity, duration: Infinity };
    }
}

// חישוב עלות נסיעה
function calculateTripCost(driver, distance, duration) {
    const fuelCost = driver.fuelCost * distance;
    const timeCost = 30 * (duration / 60); // 30 ש"ח לשעה
    return fuelCost + timeCost;
}

// בדיקת התנגשות זמנים בין שתי נסיעות
function isTimeConflict(ride1, ride2, travelTime) {
    const ride1EndTime = convertToMinutes(ride1.endTime);
    const ride2StartTime = convertToMinutes(ride2.startTime);
    return ride1EndTime + travelTime > ride2StartTime;
}

// המרת זמן למספר דקות (לדוג' "07:30" ל-450 דקות)
function convertToMinutes(time) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}

// פונקציית עזר להצגת תוצאה נקייה
function formatSchedule(assignments) {
    return Object.entries(assignments).map(([driverId, rides]) => ({
        driverId,
        rides: rides.map(r => r._id)
    }));
}

// פונקציה עיקרית לשיבוץ נהגים
async function assignDrivers(drivers, rides) {
    let assignments = {};  // הגדרת המשתנה assignments בתוך הפונקציה
    let totalCost = 0;
    rides.sort((a, b) => convertToMinutes(a.startTime) - convertToMinutes(b.startTime)); // מיון נסיעות לפי זמן התחלה

    console.log("🚦 Starting driver assignment...");

    for (let ride of rides) {
        console.log(`🚗 Processing ride ${ride._id} from ${ride.startPoint} to ${ride.endPoint}`);

        let bestDriver = null;
        let minCost = Infinity;
        let bestTravelTime = 0;

        for (let driver of drivers) {
            console.log(`🛠 Checking driver ${driver.driverId}, seats: ${driver.numberOfSeats}`);

            if (driver.numberOfSeats < ride.numberOfSeats) {
                console.log(`❌ Driver ${driver.driverId} does not have enough seats`);
                continue; // דילוג אם אין מספיק מושבים
            }

            let lastRide = assignments[driver.driverId]?.slice(-1)[0];
            let travelTime = 0;

            if (lastRide) {
                console.log(`⏳ Checking travel time from last ride (${lastRide.endPoint}) to new ride (${ride.startPoint})`);
                let { distance, duration } = await getDistanceAndTime(lastRide.endPoint_coords, ride.startPoint_coords);
                if (isTimeConflict(lastRide, ride, duration)) {
                    console.log(`⏰ Time conflict detected for driver ${driver.driverId}, skipping`);
                    continue;
                }
                travelTime = duration;
            }

            let { distance, duration } = await getDistanceAndTime(ride.startPoint_coords, ride.endPoint_coords);
            let cost = calculateTripCost(driver, distance, duration) + (travelTime * 0.5 * 30); // תוספת על נסיעות ריקות

            console.log(`💰 Cost for driver ${driver.driverId}: ${cost}`);

            if (cost < minCost) {
                minCost = cost;
                bestDriver = driver;
                bestTravelTime = travelTime;
            }
        }

        if (bestDriver) {
            console.log(`✅ Assigning ride ${ride._id} to driver ${bestDriver.driverId}`);
            if (!assignments[bestDriver.driverId]) assignments[bestDriver.driverId] = [];
            assignments[bestDriver.driverId].push(ride);
            totalCost += minCost;
        } else {
            console.log(`⚠️ No suitable driver found for ride ${ride._id}`);
        }
    }

    console.log("🎯 Assignment completed!");

    return {
        assignments: formatSchedule(assignments),
        totalCost
    };
}

// הפעלת האלגוריתם
async function main() {
    const drivers = loadJsonFile('drivers.json');
    const rides = loadJsonFile('rides.json');
    const result = await assignDrivers(drivers, rides);

    // הדפסת הפלט בלבד
    console.log(JSON.stringify(result.assignments, null, 2),result.totalCost);
}

main();
