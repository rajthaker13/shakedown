"""`shakedown scan`: bring a scan of a real workcell into a test scene."""

from __future__ import annotations

from pathlib import Path

import typer
from rich.console import Console

console = Console()
err = Console(stderr=True)


def register(app: typer.Typer) -> None:
    @app.command("import")
    def import_(
        mesh: Path = typer.Argument(..., help="A scanned mesh: OBJ, GLB, PLY or STL."),
        out: Path = typer.Option(..., "--out", "-o", help="Directory to write the scene to."),
        scale: float = typer.Option(
            1.0, "--scale", help="Multiply the scan's units to get meters."
        ),
        up: str = typer.Option("z", "--up", help="The axis pointing up in the scan: y or z."),
        max_hulls: int = typer.Option(32, "--max-hulls", min=1, max=512),
        threshold: float = typer.Option(
            0.05,
            "--threshold",
            min=0.01,
            max=1.0,
            help="Convex decomposition tolerance. Lower follows the surface more closely.",
        ),
        preview: bool = typer.Option(True, "--preview/--no-preview", help="Render preview.png."),
    ) -> None:
        """Convert a scanned mesh into collision geometry and a visual mesh for MuJoCo.

        Use the result in a scenario with the `scanned_scene` perturbation.
        """
        from shakedown.scan.importer import ScanError, import_scan, render_preview

        try:
            with console.status("decomposing the scan into convex pieces"):
                report = import_scan(
                    mesh, out, scale=scale, up=up, max_hulls=max_hulls, threshold=threshold
                )
            if preview:
                try:
                    render_preview(out, out / "preview.png")
                except ImportError:
                    err.print(
                        "[yellow]note:[/] no preview was rendered because MuJoCo is not "
                        "installed. The scene itself was written."
                    )
        except ScanError as exc:
            err.print(f"[bold red]error:[/] {exc}")
            raise typer.Exit(2) from exc

        x, y, z = report.extent_m
        console.print(f"[green]wrote[/] {report.out_dir}")
        console.print(f"  size        {x:.2f} x {y:.2f} x {z:.2f} m")
        console.print(f"  visual      {report.visual_faces:,} triangles")
        console.print(f"  collision   {report.hulls} convex pieces")
        if not report.watertight:
            console.print(
                "  [yellow]note[/]      the scan has holes, which is normal for phone scans. "
                "Check preview.png."
            )
        console.print(
            "\nUse it in a scenario:\n"
            f"  perturbations:\n    - scanned_scene: {{ path: {report.out_dir} }}"
        )
