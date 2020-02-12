const klyft = require('./../../klyft')

klyft.enableDebug()

// create a worker with two threads
let worker1 = new klyft.Worker('jobs.js', 2, true, true)
let worker2 = new klyft.Worker('jobs.js', 2, true, false)

worker1.queue('job-a', 3).then(() => {
   worker2.queue('job-b', 3)
})

worker1.queue('job-c', 10).then(() => {
   worker2.queue('job-d', 3).then(() => {
      // This worker must be killed manually because it would otherwise be already disconnected when job-d is being assinged to it. When job-b finishes and its worker is being killed, only 6 steps are done but job-d is only started after job-c ended which took 10 steps.
      worker2.kill()
   })
})
