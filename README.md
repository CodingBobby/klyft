# Klyft
> Unobstrusively make use of child processes in node.js!

Klyft will help you to manage tasks conveniently via self-managing queues that automatically run on parallel threads. Tasks not only finish faster because multiple can start at the same time and don't have to wait for each other, but also give way for the main process to continue running it's own business.

## Getting Started
For a basic setup you'll need two separate files. In theory using only one file should be possible but at this state it would result in a big loop. Klyft also requires the javascript to be run by node, so it will most likely not work from within a render process.

For this example, we will use `main.js` for the main process. This could be the main file of your app or any other required module you want to outsource some tasks from. In the main file, you make use of the `Worker` class Klyft provides. It is used to call jobs from a given module (`jobs.js` in this case) and to further process results, which is optional.

In the job module, the `Job` class is used do define the functions available for the `Worker`. It is important to call the `done()` callback when you think the job should be marked as finished. The passed value will be accessible through `.then()` in the main file.

### The Worker
```js
// main.js
const klyft = require('klyft')

// tell the worker where to search for the jobs
const worker = new klyft.Worker('job.js')

// enqueue a job called 'array-sum' and pass the array as an argument
worker.queue('array-sum', [1, 4, 1, 3])

   // do whatever you want with the result
   .then(result => {
      console.log(result) // 9
   })
```

### The Jobs
```js
// job.js
const klyft = require('klyft')

// the job name must equal the one from main.js
new klyft.Job('array-sum', function(args, done) {
   let sum = 0
   for(let i in args) {
      sum += args[i]
   }
   // return result via done()
   return done(sum)
})
```
