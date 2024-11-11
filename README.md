# d3-mindmap

A JavaScript library for generating mind maps using D3.js.


## Usage

```javascript

import MindMap from package_location


// data format for mindmap generation
const data = {
  name: "Root",
  children: [
    {
      name: "Child 1",
      children: [{ name: "Grandchild 1" }, { name: "Grandchild 2" }],
    },
    {
      name: "Child 2",
      children: [{ name: "Grandchild 3" }, { name: "Grandchild 4" }],
    },
  ],
};

//callback for when user interacts with the mindmap to update the data structure
function onJsonUpdate = (mindMapData) => void

// render the function
MindMap(document.body, onJsonUpdate)(data);
```

Checkout a live demo of d3-mindmap [here](https://mhartley.github.io/d3-mindmap-interactive)


