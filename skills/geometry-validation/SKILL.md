---
name: geometry-validation
description: Validate generated GitCAD floorplan geometry and write a concise report.
license: MIT
compatibility: ">=0.1.0"
allowed-tools: read write cli run_validation
metadata:
  author: TheHouseKraft
  version: "0.1.0"
  category: cad
---

# Geometry Validation Skill

Use this skill before claiming a generated floorplan is complete.

## Checks

- Building width and depth are finite positive numbers.
- Each room has finite positive dimensions.
- Each room lies inside the building boundary.
- Total room area is less than or equal to building area.
- Wall start and end points are finite and not identical.
- Every door/window references an existing wall ID.
- Opening width is smaller than its host wall length with clearance.

## Report

Write a concise Markdown report with:

- pass/fail status
- counts for rooms, walls, doors, and windows
- building area and room area
- validation errors, if any
- generated file list
