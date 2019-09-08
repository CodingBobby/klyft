const fork = require('child_process').fork
const debugLog = require('./lib/helper.js')

let debugEnabled = false


class Worker {
   constructor(moduleName, threads, allowDuplicates, killIfIdle) {
      this.jobQueueHandler = fork(__dirname + '/lib/queue.js')

      this.jobQueueHandler.send({
         type: 'init-queue',
         module: moduleName,
         debugEnabled: debugEnabled,
         jobsToRunParallel: threads,
         allowDuplicates: allowDuplicates
      })

      this.inProgress = []

      this.killIfIdle = killIfIdle || false
   }

   queue(jobName, args) {
      const ID = Date.now()

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

      if(this.killIfIdle && this.inProgress.length === 0) {
         this.jobQueueHandler.kill()
      }
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
            new Promise((resolve, rej) => {

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
               process.send(result)
            })
         }
      })
   }
}


module.exports = {
   Worker, Job, enableDebug: () => {
      debugEnabled = true
   }
}
