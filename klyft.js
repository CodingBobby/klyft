const fork = require('child_process').fork
const rndStr = require('randomstring').generate
const debugLog = require('./lib/helper.js')

let debugEnabled = false
let debugImportant = false

//TODO: Add possibility to "pipe-down" return values from finishing job to the next one in the same thread. This could be done by providing the option to queue not only one job at once (which is then automatically assigned to some thread) but by enqueueing an array of jobs which will then be placed in the given order into the same thread.


class Worker {
   constructor(moduleName, logName, threads, allowDuplicates, killIfIdle) {
      this.logName = logName || 'klyft'
      debugLog(debugEnabled, this.logName, 'initializing worker for '+moduleName)
      this.jobQueueHandler = fork(__dirname + '/lib/queue.js')
      debugLog(debugImportant, this.logName, 'worker live at pid '+this.jobQueueHandler.pid)

      const EventEmitter = require('events')
      class WorkerEmitter extends EventEmitter{}

      this.emitter = new WorkerEmitter()

      this.jobQueueHandler.send({
         type: 'init-queue',
         module: moduleName,
         debugImportant: debugImportant,
         debugEnabled: debugEnabled,
         logName: this.logName,
         jobsToRunParallel: threads,
         allowDuplicates: allowDuplicates,
         killIfIdle: killIfIdle,
         pid: this.jobQueueHandler.pid
      })

      this.jobQueueHandler.on('message', m => {
         if(killIfIdle && m.type === 'status' && m.data === 'queue-completed') {
            debugLog(debugImportant, this.logName, 'terminating worker '+this.jobQueueHandler.pid)
            this.jobQueueHandler.kill()
         } else {
            this.emitter.emit('message', m)
         }
      })

      this.threadCount = threads

      this.inProgress = []

      this.killIfIdle = killIfIdle || false
   }

   queue(jobName, args) {
      const dateString = Date.now().toString().split('').splice(8).join('')
      const ID = rndStr(8) + dateString

      debugLog(debugEnabled, this.logName, 'queueing '+jobName+' ('+ID+')')
      this.inProgress.push(ID)

      // Each job need a listener to react when it is done, a suboptimal way to do it but whoever pushes 900 jobs at once should expect problems.
      this.emitter.setMaxListeners(this.inProgress.length)

      return new Promise((resolve, rej) => {
         this.emitter.on('message', msg => {
            if(msg.type === 'job-done') {
               if(msg.id === ID) {
                  this._updateWorker(ID)
                  this.emitter.removeAllListeners('message')

                  resolve(msg.data)
               }
            }
         })

         try {
            if(this.jobQueueHandler.connected) {
               this.jobQueueHandler.send({
                  type: 'init-job',
                  id: ID,
                  // Since only this will be accessible for the Job, the ID is passed here as well
                  data: {
                     name: jobName,
                     args: args,
                     id: ID
                  }
               })
            } else {
               throw new Error(`Job ${ID} could not be executed, worker ${this.jobQueueHandler.pid} is not connected.`)
            }
         } catch(err) {
            console.log(err)
         }   
      })
   }

   kill() {
      this.jobQueueHandler.send({
         type: 'kill-queue'
      })

      let killedThreads = 0

      this.jobQueueHandler.on('message', m => {
         if(m.type === 'kill-queue' && m.data === 'success') {
            killedThreads++

            if(killedThreads == this.threadCount) {
               debugLog(debugImportant, this.logName, 'terminating worker '+this.jobQueueHandler.pid)
               this.jobQueueHandler.kill()
            }
         }
      })
   }

   _updateWorker(ID) {
      // remove the finished job ids so we can find out if the queue is idling or not
      this.inProgress = this.inProgress.filter(id => {
         return id !== ID
      })
   }
}


class Job {
   constructor(name, callback) {
      this.name = name
      this.callback = callback

      this.listen()
   }

   listen() {
      process.on('message', m => {
         if(m.name === this.name) {
            // Confirm that the job request was received, so that the Queue knows if the requested job even exists.
            process.send({
               type: 'status',
               data: 'starting',
               id: m.id
            })

            new Promise((resolve, rej) => {

               // run the actual task
               this.callback(m.args, function(result) {
                  // do NOT arrow-ize this function!
                  resolve(result)
               })

            }).then(result => {
               // send the results back to the main thread after callback completes
               if(result === undefined) {
                  result = 'K_undef'
               } else if(result === null) {
                  result = 'K_null'
               }
               process.send({
                  type: 'result',
                  data: result,
                  id: m.id
               })
            })
         }
      })
   }
}


module.exports = {
   Worker, Job, enableDebug: onlyImportant => {
      debugEnabled = onlyImportant ? false : true
      debugImportant = true // always on
   }
}
