const klyft = require('./../../klyft')

klyft.enableDebug()

// create a worker with two threads
let worker = new klyft.Worker('jobs.js', 1, false)

// the same job with the same argument is called twice at pretty much the same time
worker.queue('job-a', 5)
worker.queue('job-a', 5)
worker.queue('job-a', 5)
worker.queue('job-a', 5)
worker.queue('job-a', 5)
worker.queue('job-a', 5)
worker.queue('job-a', 5)