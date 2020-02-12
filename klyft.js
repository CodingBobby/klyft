const fork = require('child_process').fork
const rndStr = require('randomstring').generate
const debugLog = require('./lib/helper.js')

let debugEnabled = false
let debugImportant = false


class Worker {
   constructor(moduleName, threads, allowDuplicates, killIfIdle) {
      debugLog(debugEnabled, 'klyft', 'initializing worker for '+moduleName)
      this.jobQueueHandler = fork(__dirname + '/lib/queue.js')
      debugLog(debugImportant, 'klyft', 'worker live at pid '+this.jobQueueHandler.pid)

      this.jobQueueHandler.send({
         type: 'init-queue',
         module: moduleName,
         debugImportant: debugImportant,
         debugEnabled: debugEnabled,
         jobsToRunParallel: threads,
         allowDuplicates: allowDuplicates,
         killIfIdle: killIfIdle,
         pid: this.jobQueueHandler.pid
      })

      this.threadCount = threads

      this.inProgress = []

      this.killIfIdle = killIfIdle || false

      if(killIfIdle) {
         this.jobQueueHandler.on('message', m => {
            if(m.type === 'status' && m.data === 'queue-completed') {
               debugLog(debugImportant, 'klyft', 'terminating worker '+this.jobQueueHandler.pid)
               this.jobQueueHandler.kill()
            }
         })
      }
   }

   queue(jobName, args) {
      const dateString = Date.now().toString().split('').splice(8).join('')
      const ID = rndStr(8) + dateString

      debugLog(debugEnabled, 'klyft', 'queueing '+jobName+' ('+ID+')')
      this.inProgress.push(ID)

      return new Promise((resolve, rej) => {
         this.jobQueueHandler.on('message', msg => {
            if(msg.type === 'job-done') {
               if(msg.id === ID) {
                  this._updateWorker(ID)
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
               debugLog(debugImportant, 'klyft', 'terminating worker '+this.jobQueueHandler.pid)
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
