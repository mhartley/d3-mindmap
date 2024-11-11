import { hierarchy, tree as createTree, HierarchyNode, HierarchyPointNode } from 'd3-hierarchy';
import { select, Selection } from 'd3-selection';
import { scaleOrdinal } from 'd3-scale';
import { zoom, zoomTransform } from 'd3-zoom';
import { drag } from 'd3-drag';
import 'd3-transition';
import { Circle } from '@react-google-maps/api';

interface MindMapData {
  name: string;
  children?: MindMapData[];
}

interface Options {
  colorSet?: string[];
  density?: number;
  nodeMarkerRadius?: number;
}

interface Axis {
  x: number;
  y: number;
}

interface DragState {
  nodeStart: Axis;
  pointerStart: Axis;
  pointerNodeOffset?: Axis; // offset between pointer and node center
  nearestNode?: MNode;
  transform: Axis & { k: number };
}


type MNode = HierarchyNode<MindMapData> & {
  x0: number;
  y0: number;
  x: number;
  y: number;
  dragState?: DragState | null;
  _children?: MNode[]; // collapsed children
}

function diagonal(s: Axis, d: Axis) {
  return `M ${s.y} ${s.x}
    C ${(s.y + d.y) / 2} ${s.x},
      ${(s.y + d.y) / 2} ${d.x},
      ${d.y} ${d.x}`;
}

//given an MNode, return the corresponding DOM element
function getNodeElement(node: MNode): Selection<SVGGElement, unknown, HTMLElement, any> {
  return select(`g.node[data-id="${node.id}"]`);
}

// Add helper function to find nearest node
function findNearestNodeByPosition(node: MNode, nodes: MNode[], threshold: number = 100): MNode | null {
  let nearest: MNode | null = null;
  let minDistance = threshold;

  let position: Axis = { x: node.x, y: node.y };

  // get x and y of mouse, not node for better dragging
  // if (node.dragState?.pointerNodeOffset) {
  //   position = {
  //     x: node.dragState.pointerStart.x + (node.dragState.pointerNodeOffset.x * node.dragState.transform.k),
  //     y: node.dragState.pointerStart.y + (node.dragState.pointerNodeOffset.y * node.dragState.transform.k),
  //   }
  // };

  nodes.filter(d => d.id !== node.id).forEach(d => {

    const distance = Math.sqrt(
      Math.pow(position.x - d.x, 2) + 
      Math.pow(position.y - d.y, 2)
    );
    
    if (distance < minDistance) {
      minDistance = distance;
      nearest = d;
    }
  });

  return nearest;
}

// Add helper function to check if a node is a descendant of another
function isDescendantOf(node: MNode, target: MNode): boolean {

  if (node.id === target.id) {
    return true;
  }

  if (node.parent) {
    return isDescendantOf(node.parent, target);
  }

  return false;
}


function addBoundingBox(
    selection: Selection<SVGGElement, any, any, any>, 
    options: {
      padding?: number,
      className?: string,
      color?: string,
      strokeWidth?: string,
    }
  ): void {

  const padding = options.padding || 3;
  const className = options.className || 'highlight-box';
  const color = options.color || '#1f77b4';
  const strokeWidth = options.strokeWidth || '2px';

  selection.selectAll(`rect.${className}`).remove();
  
  const bbox = selection.node().getBBox();
  
  let rect = selection.append('rect')

  rect = rect
    .attr('class', className)
    .attr('x', bbox.x - padding)
    .attr('y', bbox.y - padding)
    .attr('width', bbox.width + padding * 2)
    .attr('height', bbox.height + padding * 2)
    .style('fill', 'none')
    .style('stroke', color)
    .style('stroke-width', strokeWidth)
    // .style('opacity', 0.0);

    // rect.transition().duration(100).style('opacity', 0.8);

}



export default function MindMap(
  container: HTMLElement, 
  options: Options = {},
) {

  // init options
  const colorSet = options.colorSet || ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
  const density = options.density || 1;
  const nodeMarkerRadius = options.nodeMarkerRadius || 5;


  // init the svg and tree
  const svg = select(container).append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .style('overflow', 'scroll')
  const svgGroup = svg.append('g');

  const height = container.clientHeight;
  const width = container.clientWidth;
  const tree = createTree<MindMapData>().size([height, width]);

  const color = scaleOrdinal(colorSet);
  let root: MNode | undefined;

  svg.call(zoom().on('zoom', ev => {
    svgGroup.attr('transform', ev.transform);
  }));


  // Animation of circle grow/shrink on hover
  function animateNodeMarkerSizeChange(nodeMarker: Selection<SVGCircleElement, unknown, HTMLElement | null , any>, targetRadius: number = nodeMarkerRadius) {
    nodeMarker.transition().duration(150)
      .attr('r', targetRadius);
  }


  /* 
    EVENT HANDLERS
  */

  /* DRAG HANDLERS
  
    nodeDragStart: 
     1.calculates offset between click and node center
     2. creates a clone of the node, which is what is dragged on the map
     3. raises the cloned node to the top of the stack
    4. returns the original node to non-hovered size

    nodeDrag:
     1. calculates the movement in SVG coordinates using zoom transform. This account for pan (x,y) and zoom (k)
     2. Applies the movement to the starting position.
     3. Finds the nearest node if within threshold, updates highlight box and sets the nearest node in drag state.

    nodeDragEnd:
      1. Removes the cloned node and highlight box
      2. Deletes the drag state
      3. Updates the the the mind map if needed
  */


  function nodeDragStart(event: any, d: MNode) {
    const transform = zoomTransform(svg.node());
    const pointerSvgCoords = transform.invert([event.x, event.y]);


    
    // Store initial state
    d.dragState = {
      transform: { x: transform.x, y: transform.y, k: transform.k },
      nodeStart: { x: d.x, y: d.y },
      pointerStart: { x: pointerSvgCoords[0], y: pointerSvgCoords[1] },
      pointerNodeOffset: { x: pointerSvgCoords[0] - d.x, y: pointerSvgCoords[1] - d.y },
    };
  
    // Create clone
    const originalNode = select(this);
    const clonedNode = originalNode.clone(true);
    clonedNode.classed('dragging', true);
    
    const foundNode = svgGroup.node();
    if (foundNode) foundNode.appendChild(clonedNode.node());
    clonedNode.raise();
  
    // Return original node to non-hovered size. 
    animateNodeMarkerSizeChange(originalNode.select('circle'));

  }
  
  function nodeDrag(event: any, draggingNode: MNode) {
    const transform = zoomTransform(svg.node());
    const pointerSvgCoords = transform.invert([event.x, event.y]);

    if (!draggingNode.dragState) { 
      console.error('No drag state initialized');
      return;
    }

    
    // Calculate movement in SVG coordinates
    const dx = pointerSvgCoords[0] - draggingNode.dragState.pointerStart.x;
    const dy = pointerSvgCoords[1] - draggingNode.dragState.pointerStart.y;
  
    // Apply movement to starting position, multiplied by zoom level
    draggingNode.y = draggingNode.dragState.nodeStart.y + dx * transform.k;
    draggingNode.x = draggingNode.dragState.nodeStart.x + dy * transform.k;

  
    // Find nearest node if withing threshold
    const nearestNode = findNearestNodeByPosition(draggingNode, root.descendants());

    // Update highlight box and set the nearest node in drag state.
    if (nearestNode) {
      const nearestNodeElement = getNodeElement(nearestNode);

      // we can't drop to our own descendants or parent
      if (isDescendantOf(nearestNode, draggingNode) || nearestNode.id === draggingNode?.parent?.id) {
        delete draggingNode.dragState?.nearestNode;
        addBoundingBox(nearestNodeElement, {className: 'highlight-box', color: 'red'});

      // all good, go ahead an highlight the node for drop
      } else {
        addBoundingBox(nearestNodeElement, {className: 'highlight-box'});
        draggingNode.dragState.nearestNode = nearestNode;
      }
    } else {
      delete draggingNode.dragState?.nearestNode;
    }

    svgGroup.selectAll('.highlight-box').filter((d: any) => d.id !== nearestNode?.id)
      .transition().duration(100).style('opacity', 0.0).remove()

  
    // Finally, move the cloned node to the new position
    select('g.node.dragging')
      .attr('transform', `translate(${draggingNode.y}, ${draggingNode.x})`);
  }
  
  function nodeDragEnd(event: any, d: MNode) {
    select('g.node.dragging').remove();
    svgGroup.selectAll('.highlight-box').transition().duration(300).style('opacity', 0.0).remove().remove();
    const nearestNode = d.dragState?.nearestNode;

    if (nearestNode) {
      // swap positions
      console.group('Drop Event');
      console.log("Swapping positions of nodes");
      console.log("Node 1: ", d);
      if (d.parent) {
        console.log("children of parent: ", d.parent.children);
        d.parent.children = d.parent.children?.filter(child => child.id !== d.id) || undefined;

        // D3 does not allow empty child arrays.
        if (d.parent.children?.length === 0) {
          delete d.parent.children;
        }
        console.log("children of parent after removal: ", d.parent.children);
      }
      nearestNode.children = [...(nearestNode.children || []), d];
      console.log("Children of nearest node: ", nearestNode.children);
      d.parent = nearestNode;

      // The depth of a node is not recalculated after moving it, so we 
      // manually set to the depth of the nearest node + 1
      d.depth = nearestNode.depth + 1;

      if (d.children) {
        // If the node has children, we need to update their depth as well, recursively down the tree
        const updateChildrenDepth = (node: MNode, depth: number) => {
          node.depth = depth;
          if (node.children) {
            node.children.forEach(child => updateChildrenDepth(child, depth + 1));
          }
        }
        d.children.forEach(child => updateChildrenDepth(child, d.depth + 1));
      }

      /* 
      Update the mind map from the root.
      Note that future programmers shouldn't optimize by updating from the node,
      the magic of d3 enter/update/exit update selection is that it handles this
      complexity for us with key bindings.
      */
      update(root); 

      console.groupEnd();
    } 

    delete d.dragState;  // Clean up stored state
  }

  
  /* 
    NODE MOUSE EVENTS
  */

  function nodeClicked(event: MouseEvent, d: MNode) {
    if (d.children) {
      d._children = d.children;
      delete d.children;
    } else {
      d.children = d._children;
      delete d._children;
    }
    update(d);
  }

  //mouse over function
  function mouseOver(event: MouseEvent, d: HierarchyPointNode<MindMapData> | MNode) {
    const t = select(this);
    t.style('cursor', 'pointer');
    t.select('circle')
      .transition().duration(150)
      .attr('r', 9);
  }

  function mouseOut(event: MouseEvent, d: HierarchyPointNode<MindMapData> | MNode) {
    const t = select(this)
    t.style('cursor', 'default');
    t.select('circle')
      .transition().duration(150)
      .attr('r', 5);
  }
  
  // update function
  function update(source: MNode) {
    if (!source) {
      return;
    }
    const treeData = tree(source);

    //duplicate the x y values for cloning and dragging. This makes all nodes of type MNode
    const nodes = treeData.descendants()

    const links = treeData.links();

    nodes.forEach(d => {
      d.y = d.depth * 180;
    });

    let i = 0;
    const node = svgGroup.selectAll('.node')
      .data(nodes, (d: any) => d.id || (d.id = ++i))

    const nodeEnter = node.enter()
      .append('g')
      .attr('class', 'node')
      .attr('data-id', d => d.id)
      .attr('transform', d => `translate(${source.y0}, ${source.x0})`)
      .on('mouseover', mouseOver)
      .on('mouseout', mouseOut)
      .call(drag<MNode, unknown>()
        .on('start', nodeDragStart)
        .on('drag', nodeDrag)
        .on('end', nodeDragEnd))


    nodeEnter.append('circle')
      .attr('r', 5)
      .style('fill', d => color(String(d.depth)))
      .style('cursor', 'pointer')
      .style('stroke', '#fff')
      .style('stroke-width', '1.5px');

    nodeEnter.append('text')
      .attr('dx', d => d.children ? -12 : 12)
      .attr('dy', 3)
      .style('text-anchor', d => d.children ? 'end' : 'start')
      .style('font-size', '10px')
      .style('font-family', 'sans-serif')
      .text(d => d.data.name);

    const nodeUpdate = nodeEnter.merge(node);

    nodeUpdate.transition()
      .duration(750)
      .attr('transform', d => `translate(${d.y}, ${d.x})`);

    nodeUpdate.select('circle')
      .attr('r', 4.5)
      .style('fill', d => color(d.depth))
      .on('click', nodeClicked);

    nodeUpdate.select('text')
      .attr('dx', d => d.children ? -12 : 12)
      .attr('dy', 3)
      .style('text-anchor', d => d.children ? 'end' : 'start')
      .text(d => d.data.name);

    const nodeExit = node.exit()
      .transition()
      .duration(750)
      .attr('transform', d => `translate(${source.y}, ${source.x})`)
      .remove();

    nodeExit.select('circle')
      .attr('r', 1e-6);

    nodeExit.select('text')
      .style('fill-opacity', 1e-6);

    const link = svgGroup.selectAll('.link')
      .data(links, d => d.target.id);


    const linkEnter = link.enter().insert('path', 'g')
      .attr('class', 'link')
      .attr('d', () => {
        const o = { x: source.x0, y: source.y0 };
        return diagonal(o, o);
      })
      .style('fill', 'none')
      .style('stroke', '#ccc')
      .style('stroke-width', '1.5px');

    const linkUpdate = linkEnter.merge(link);

    linkUpdate.transition()
      .duration(250)
      .attr('d', d => diagonal(d.source, d.target));

    link.exit().transition()
      .duration(250)
      .attr('d', () => {
        const o = { x: source.x, y: source.y };
        return diagonal(o, o);
      })
      .remove();

    nodes.forEach(d => {
      d.x0 = d.x;
      d.y0 = d.y;
    });

  }

  function renderFromData(data: MindMapData) {
    root = hierarchy(data) as MNode;
    root.x0 = height / 2;
    root.y0 = 0;
    update(root);
    return {
      root,
      svg,
      svgGroup,
    };
  }

  return renderFromData;
}