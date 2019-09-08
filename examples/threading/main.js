const klyft = require('./../../klyft')

klyft.enableDebug()

// create a worker with two threads
let worker = new klyft.Worker('jobs.js', 2, true, true)

worker.queue('job-a', 5)
worker.queue('job-b', 5)
worker.queue('job-c', 5)
worker.queue('job-d', 5)
