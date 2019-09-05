# Klyft

> Unobstrusively make use of child processes in node.js!

## Getting Started

For a basic setup you'll need two separate files. In theory using only one file should be possible but at this state it would result in a big loop.

For this example we will use `main.js` for the main process. This could be the main file of your app or any other required module you want to outsource some tasks from. Klyft requires the javascript to be run by node, so it will most likely not work from within a render process. In this file we will only handle the results of tasks—or jobs as we call them.

### The Worker

```js
// main.js
const klyft = require('klyft')

// tell the worker where to search for the jobs
const worker = new klyft.Worker('jobs.js')

// enqueue a job called 'array-sum' and pass the array as an argument
worker.queue('array-sum', [1, 4, 1, 3])

   // do whatever you want with the result
   .then(result => {
      console.log(result) // 9
   })
```

Okay this is very simple, right? Lets take a closer look.

After including klyft, you want to create a new worker and tell it the path to the `jobs.js` (we'll discuss it shortly). Remember to include the path relative to `main.js`, for example if you keep the job modules in a different folder.

You can now push jobs to the worker's queue by telling the job's name and optional arguments it takes. The job name is case sensitive and must be unique within the given job module you gave the worker. Since klyft is based on promises, you can use `.then()` to further process the final results of the job.

The jobs that are available to be run from this `main.js` are defined and initialized from the second file which we named `jobs.js`. Let's look at it.


### The Jobs

```js
// jobs.js
const klyft = require('klyft')

// the job name must equal the one from main.js
const job = new klyft.Job('array-sum', function(args, done) {
   let sum = 0
   for(let i in args) {
      sum += args[i]
   }
   // return results via done()
   return done(sum)
})
```

Yep, thats everything! 

So what you see there is the definition of a job that is called exacly like we call it from `main.js`. Within the job you define the actual function to execute. There, you can do whatever you want—from simple logs and calculations over regex magic to time consuming triangulation and turle-slow http requests everything is possible.

Instead of just returning results like you normally do, you'll have to wrap into the `done()` callback. That way the worker knows when the job is completed.
