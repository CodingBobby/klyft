const fork = require('child_process').fork
const debugLog = require('./helper.js')

let debugEnabled = false
let debugImportant = false
let jobQueue

process.on('message', m => {
   switch(m.type) {
      case 'init-queue': {
         debugImportant = m.debugImportant
         debugEnabled = m.debugEnabled
         jobQueue = new Queue(m.module, m.allowDuplicates, m.jobsToRunParallel)
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
   constructor(module, allowDuplicates, jobsToRunParallel) {
      this.init = Date.now()
      
      // this array holds Job objects
      // The contained jobs are processed in reversed order. The last item in the array is processed first. When queueing a new job, it is appended to the beginning of it.
      this.jobs = []

      // Relative path of the module, job requests are being sent to.
      this.module = module

      // IDs of the jobs that are currently running
      this.running = []

      // if enabled, duplicated jobs are removed
      if(allowDuplicates === undefined) {
         allowDuplicates = true
      }
      this.duplicable = allowDuplicates

      // defines how many jobs are allowed to run in parallel
      if(jobsToRunParallel <= 0 || jobsToRunParallel === undefined || jobsToRunParallel === null) {
         jobsToRunParallel = 1
      }
      this.maxThreads = jobsToRunParallel

      debugLog(debugEnabled, 'klyft', `queue initialized with ${this.maxThreads} thread(s)`)
   }

   add(job) {
      debugLog(debugEnabled, 'klyft', 'adding job to queue: '+job.data.name)
      // If there are no other jobs in the queue, it means that it was either just initiallized or already completed some time before. In both cases, we have to (re)start the process of working on the jobs.
      let isBlanc = this.jobs.length === 0

      function restart(_this, job) {
         _this.jobs.unshift(job)
         if(isBlanc) {
            // update to the actual time where the first job started
            _this.init = Date.now()
            // (re)start the worker
            _this.nextJob()
         }
      }

      // If duplicated jobs are not allowed, we first check if the job to add is already in the queue and if, remove it.
      if(!this.duplicable) {
         let alreadyExists = false
         this.jobs.forEach(queuedJob => {
            // only compare the data as the id will be different
            let a = queuedJob.data
            let b = job.data
            if(a.name == b.name && a.args == b.args) {
               alreadyExists = true
            }
         })
         if(!alreadyExists) {
            restart(this, job)
         }
      } else {
         restart(this, job)
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

         let started = false

         // Listening for messages the Job class sends back to the main process. The message type 'status' is used to find out if the job has started. If we don't receive this message withing a given time delay, the job will probably never start and we must kill it to prevent file overflows.
         jobHandler.on('message', m => {
            switch(m.type) {
               case 'status': {
                  if(m.data === 'starting') {
                     debugLog(debugImportant, 'klyft', `${job.data.name} confirmed @${Date.now()-this.init}ms`)
                     started = true
                  }
                  break
               }

               case 'result': {
                  // the job was done and the result can be sent back
                  done(job.id, m.data, jobHandler)

                  debugLog(debugImportant, 'klyft', `${job.data.name} done @${Date.now()-this.init}ms`)

                  // remove the job from queue and resume
                  this.finished(job.id) // unmark it from running
                  this.nextJob() // run the next job
                  break
               }
            }
         })

         // start the job
         this.running.push(job.id) // mark it as running
         debugLog(debugEnabled, 'klyft', `started ${job.data.name}`)
         jobHandler.send(job.data) // start it

         this.jobs.pop() // remove it from the queue

         // ask for more jobs to run
         this.nextJob()

         // now find out if it actually started
         setTimeout(() => {
            if(!started) {
               // if it did not start within 100ms, kill it with fire
               debugLog(debugImportant, 'error', 'klyft job did not start')
               done(job.id, 'K_failed', jobHandler)
            }
         }, 2e3)
      } else {
         if(this.running.length === 0) {
            debugLog(debugEnabled, 'klyft', 'queue-completed')
            // notify the Worker that it can be terminated
            process.send({
               type: 'status',
               data: 'queue-completed'
            })
         }
      }
   }

   finished(ID) {
      // remove the ID
      this.running = this.running.filter(id => {
         return id !== ID
      })
   }
}


function done(id, result, handler) {
   try {
      let wasSent = process.send({
         type: 'job-done',
         id: id,
         data: result
      })

      if(!wasSent) {
         // job result was not sent to parent
         throw new Error()
      }
   } catch(err) {
      if(err) {
         debugLog(debugImportant, 'error', 'queue could not send result back: '+result, err.stack)
      }
   } finally {
      if(result === 'K_failed') {
         // job failed
         handler.kill()
      } else {
         // kill the job to prevent it from keeping running
         setTimeout(() => {
            handler.kill()
         }, 2e3)
      }
   }
}
