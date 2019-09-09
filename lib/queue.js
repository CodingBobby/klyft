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
         jobQueue = new Queue(m.module, m.allowDuplicates, m.jobsToRunParallel, m.killIfIdle)
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
   constructor(module, allowDuplicates, maxThreads, killIfIdle) {
      this.init = Date.now()
      
      // this array holds Job objects
      // The contained jobs are processed in reversed order. The last item in the array is processed first. When queueing a new job, it is appended to the beginning of it.
      this.jobs = []

      // Relative path of the module, job requests are being sent to.
      this.module = module

      // if enabled, duplicated jobs are removed
      if(allowDuplicates === undefined) {
         allowDuplicates = true
      }
      this.duplicable = allowDuplicates

      // defines how many jobs are allowed to run in parallel
      if(maxThreads <= 0 || maxThreads === undefined || maxThreads === null) {
         maxThreads = 1
      }
      this.maxThreads = maxThreads

      this.threads = []
      for(let t=0; t<this.maxThreads; t++) {
         this.threads.push(new Thread(this.module, t))
      }

      this.killIfIdle = killIfIdle

      debugLog(debugImportant, 'klyft', `queue initialized with ${this.maxThreads} thread(s)`)
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
         } else {
            debugLog(debugImportant, 'klyft', `duplicated ${job.data.name} terminated`)
         }
      } else {
         restart(this, job)
      }
   }

   nextJob() {
      let free = this.freeThreads()
      debugLog(debugEnabled, 'klyft', `${free.length} free threads`)
      if(free.length > 0) {
         // start the next available job on the first free thread
         this.start(free[0])
      }
   }

   start(onThread) {
      // This method is recursively called when a job was completed to start the next job. When all jobs are completed, we can stop the loop and set this worker to idle.
      let jobsAvailable = this.jobs.length > 0

      if(jobsAvailable) {
         const job = this.jobs[this.jobs.length - 1]
         let jobHandler = this.threads[onThread].fork

         let started = false

         // Listening for messages the Job class sends back to the main process. The message type 'status' is used to find out if the job has started. If we don't receive this message withing a given time delay, the job will probably never start and we must kill it to prevent file overflows.
         jobHandler.on('message', m => {
            switch(m.type) {
               case 'status': {
                  if(m.data === 'starting' && m.id === job.id) {
                     debugLog(debugImportant, 'klyft', `confirmed ${job.id} @${Date.now()-this.init}ms`)
                     started = true
                  }
                  break
               }

               case 'result': {
                  if(m.id === job.id) {
                     // the job was done and the result can be sent back
                     this.done(job.id, m.data, onThread)

                     debugLog(debugImportant, 'klyft', `done ${job.id} @${Date.now()-this.init}ms`)

                     // remove the job from queue and resume
                     this.nextJob() // run the next job
                  }
                  break
               }
            }
         })

         // start the job
         this.threads[onThread].busy()
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
               this.done(job.id, 'K_failed', onThread)
               this.nextJob()
            }
         }, 2e3)
      } else {
         if(this.freeThreads().length === this.maxThreads) {
            debugLog(debugEnabled, 'klyft', 'queue-completed')
            // terminate all threads if desired
            if(this.killIfIdle) {
               this.killAllThreads()
            }
            // notify the Worker that it can be terminated
            process.send({
               type: 'status',
               data: 'queue-completed'
            })
         }
      }
   }

   freeThreads() {
      let free = []
      this.threads.forEach(t => {
         if(t.idle) {
            free.push(t.index)
         }
      })
      return free
   }

   killAllThreads() {
      this.threads.forEach(t => {
         t.fork.kill()
      })
   }

   // called whenever a job is done and wants it's result to be sent back
   done(id, result, onThread) {
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
         this.threads[onThread].relax()
      }
   }
}


class Thread {
   constructor(module, index) {
      this.fork = fork(module)
      this.index = index
      this.idle = true
   }

   busy() {
      this.idle = false
   }

   relax() {
      this.idle = true
   }
}
