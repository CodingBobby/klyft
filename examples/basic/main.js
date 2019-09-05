const klyft = require('./../../klyft')

klyft.enableDebug()

let worker = new klyft.Worker('jobs.js')

worker.queue('example-job', 'hello world')

.then(result => {
   console.log(result)
})


worker.queue('another-job', 'bye world')

.then(result => {
   console.log(result)
})
