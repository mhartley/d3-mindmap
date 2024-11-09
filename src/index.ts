import { hierarchy, tree as createTree, HierarchyNode } from 'd3-hierarchy';
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

type MNode = HierarchyNode<MindMapData> & {
  x0: number;
  y0: number;
  x: number;
  y: number;
  dragOffsetX: number | undefined;
  dragOffsetY: number | undefined;
};

function diagonal(s: Axis, d: Axis) {
  return `M ${s.y} ${s.x}
    C ${(s.y + d.y) / 2} ${s.x},
      ${(s.y + d.y) / 2} ${d.x},
      ${d.y} ${d.x}`;
}




export default function getRender(container: HTMLElement, options: Options = {}) {

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



  function animateNodeMarkerSizeChange(nodeMarker: Selection<SVGCircleElement, unknown, HTMLElement | null , any>, targetRadius: number = nodeMarkerRadius) {
    nodeMarker.transition().duration(150)
      .attr('r', targetRadius);
  }

  function nodeDragStart(event: any, d: MNode) {
    if (!event.active) {
      d.x0 = d.x;
      d.y0 = d.y;
    }
  
    // Store the initial pointer position relative to the node
    const transform = zoomTransform(svg.node());
    const pointer = transform.invert([event.x, event.y]);
    d.dragOffsetX = d.y - pointer[0];
    d.dragOffsetY = d.x - pointer[1];
  
    // Create clone of dragged node
    const originalNode = select(this);
    const clonedNode = originalNode.clone(true);
    clonedNode.classed('dragging', true);
    
    // Append clone to SVG group and raise it
    const foundNode = svgGroup.node();
    if (foundNode) foundNode.appendChild(clonedNode.node());
    clonedNode.raise();
  
    // Reset original node marker size
    animateNodeMarkerSizeChange(originalNode.select('circle'));
  }
  
  function nodeDrag(event: any, d: MNode) {
    // Get current zoom transform
    const transform = zoomTransform(svg.node());
    
    // Convert screen coordinates to SVG coordinates
    const pointer = transform.invert([event.x, event.y]);
    
    // Update node position using stored offset
    d.x = pointer[1] + d.dragOffsetY;
    d.y = pointer[0] + d.dragOffsetX;
  
    // Update dragged node position
    select('g.node.dragging')
      .attr('transform', `translate(${d.y}, ${d.x})`);
  
    // Collision detection
    const nodes = svgGroup.selectAll('.node').filter(node => node !== d);
    let closestNode = null;
    let minDistance = 30;
  
    nodes.each(function(otherNode: MNode) {
      const distance = Math.hypot(otherNode.x - d.x, otherNode.y - d.y);
      if (distance < minDistance) {
        minDistance = distance;
        closestNode = otherNode;
      }
    });
  
    // Highlight nearest node
    nodes.select('rect.highlight-box').remove();
    
    if (closestNode) {
      select(svgGroup.selectAll('.node').filter(node => node === closestNode).node())
        .append('rect')
        .attr('class', 'highlight-box')
        .attr('x', -10)
        .attr('y', -10)
        .attr('width', 20)
        .attr('height', 20)
        .style('fill', 'none')
        .style('stroke', 'red')
        .style('stroke-width', '2px');
    }
  }

  function nodeDragEnd(event: any, d: HierarchyNode<MindMapData>) {

    // delete dragging copy
    select('g.node.dragging').remove();

    //delete collision artifact
    svgGroup.selectAll('.highlight-box').remove();


  }


  // update function
  function update(source: MNode) {
    if (!root) {
      return;
    }
    const treeData = tree(root);
    const nodes = treeData.descendants();
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
      .attr('transform', d => `translate(${source.y0}, ${source.x0})`)
      .on('mouseover', function () {
        select(this)
          .style('cursor', 'pointer');
        select(this).select('circle')
          .transition().duration(150)
          .attr('r', 9);
      })
      .on('mouseout', function () {
        select(this).style('cursor', 'default');
        select(this).select('circle')
          .transition().duration(150)
          .attr('r', 5);
      })
      .call(drag<MNode, unknown>()
        .on('start', nodeDragStart)
        .on('drag', nodeDrag)
        .on('end', (e, d) => nodeDragEnd(e, d)))

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

    function nodeClicked(event, d) {
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        d.children = d._children;
        d._children = null;
      }
      update(d);
    }
  }

  return function (data: MindMapData) {
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
}