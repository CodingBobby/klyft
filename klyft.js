const fork = require('child_process').fork
const rndStr = require('randomstring').generate
const debugLog = require('./lib/helper.js')

let debugEnabled = false
let debugImportant = false


class Worker {
   constructor(moduleName, threads, allowDuplicates, killIfIdle) {
      this.jobQueueHandler = fork(__dirname + '/lib/queue.js')

      this.jobQueueHandler.send({
         type: 'init-queue',
         module: moduleName,
         debugImportant: debugImportant,
         debugEnabled: debugEnabled,
         jobsToRunParallel: threads,
         allowDuplicates: allowDuplicates
      })

      this.inProgress = []

      this.killIfIdle = killIfIdle || false

      if(killIfIdle) {
         this.jobQueueHandler.on('message', m => {
            if(m.type === 'status' && m.data === 'queue-completed') {
               debugLog(debugEnabled, 'klyft', 'terminating worker')
               this.jobQueueHandler.kill()
            }
         })
      }
   }

   queue(jobName, args) {
      const dateString = Date.now().toString().split('').splice(8).join('')
      const ID = rndStr(8) +'_'+ dateString

      debugLog(debugEnabled, 'klyft', 'queueing job '+ID)
      this.inProgress.push(ID)

      return new Promise((resolve, rej) => {
         this.jobQueueHandler.on('message', msg => {
            if(msg.type === 'job-done') {
               if(msg.id === ID) {
                  this.updateWorker(ID)
                  resolve(msg.data)
               }
            }
         })

         this.jobQueueHandler.send({
            type: 'init-job',
            id: ID,
            data: {
               name: jobName,
               args: args
            }
         })
      })
   }

   updateWorker(ID) {
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
               data: 'starting'
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
                  data: result
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
