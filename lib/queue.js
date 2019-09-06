const fork = require('child_process').fork
const debugLog = require('./helper.js')

let debugEnabled = false
let jobQueue

process.on('message', m => {
   switch(m.type) {
      case 'init-queue': {
         debugEnabled = m.debugEnabled
         jobQueue = new Queue(m.module, m.jobsToRunParallel)
         break
      }

      case 'init-job': {
         jobQueue.add({
            id: m.id,
            data: m.data // the job
         })
         break
      }
   }
})


class Queue {
   constructor(module, jobsToRunParallel) {
      debugLog(debugEnabled, 'klyft', 'queue initializing')
      
      // this array holds Job objects
      // The contained jobs are processed in reversed order. The last item in the array is processed first. When queueing a new job, it is appended to the beginning of it.
      this.jobs = []

      // Relative path of the module, job requests are being sent to.
      this.module = module

      // IDs of the jobs that are currently running
      this.running = []

      // defines how many jobs are allowed to run in parallel
      if(jobsToRunParallel === 0 || jobsToRunParallel === undefined || jobsToRunParallel === null) {
         jobsToRunParallel = 1
      }
      this.maxThreads = jobsToRunParallel

      this.init = Date.now()
   }

   add(job) {
      debugLog(debugEnabled, 'klyft', 'adding job to queue', job)
      // If there are no other jobs in the queue, it means that it was either just initiallized or already completed some time before. In both cases, we have to (re)start the process of working on the jobs.
      let isBlanc = this.jobs.length === 0

      this.jobs.unshift(job)

      if(isBlanc) {
         // update to the actual time where the first job started
         this.init = Date.now()
         // (re)start the worker
         this.nextJob()
      }
   }

   nextJob() {
      let runningJobs = this.running.length
      debugLog(debugEnabled, 'klyft', `${runningJobs} running jobs`)
      if(runningJobs < this.maxThreads) {
         // only fires if a thread is free
         this.start()
      }
   }

   start() {
      // This method is recursively called when a job was completed to start the next job. When all jobs are completed, we can stop the loop and set this worker to idle.
      let jobsAvailable = this.jobs.length > 0

      if(jobsAvailable) {
         const job = this.jobs[this.jobs.length - 1]
         let jobHandler = fork(this.module)

         // This is the listener that fires when the job is done. It needs to be initialized before the job is even started because time delays could otherwise cause the job to finish before.
         jobHandler.once('message', result => {
            // the job was done and the result can be sent back
            done(job.id, result)

            debugLog(debugEnabled, 'klyft', `${job.data.name} done @${Date.now()-this.init}ms`)

            // remove the job from queue and resume
            this.finished(job.id) // unmark it from running
            this.nextJob() // run the next job
         })

         // start the job
         this.running.push(job.id) // mark it as running
         debugLog(debugEnabled, 'klyft', `started ${job.data.name}`)
         jobHandler.send(job.data) // start it
         this.jobs.pop() // remove it from the queue

         // ask for more jobs to run
         this.nextJob()
      } else {
         // stop the worker
         debugLog(debugEnabled, 'klyft', 'queue completed')
      }
   }

   finished(ID) {
      // remove the ID
      this.running = this.running.filter(id => {
         return id !== ID
      })
   }
}


function done(id, result) {
   process.send({
      type: 'job-done',
      id: id,
      data: result
   })
}
