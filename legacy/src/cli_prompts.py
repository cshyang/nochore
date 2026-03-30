"""CLI prompt helpers for interactive selections."""

import sys
from typing import List

import inquirer
from rich.console import Console

console = Console()

ALL_CLIENTS_LABEL = "All clients"


def _is_interactive() -> bool:
    return sys.stdin.isatty()


def prompt_clients(available_clients: List[str]) -> List[str]:
    if not available_clients:
        return []
    if not _is_interactive():
        return available_clients

    console.print()
    console.print("[bold cyan]🧭 Select Clients[/bold cyan]")
    console.print("[dim]Tip: uncheck 'All clients' to pick a subset.[/dim]")
    console.print()

    choices = [ALL_CLIENTS_LABEL] + available_clients
    default_selection = choices[:]

    while True:
        answers = inquirer.prompt(
            [
                inquirer.Checkbox(
                    "clients",
                    message="Select clients (space to toggle)",
                    choices=choices,
                    default=default_selection,
                    carousel=False,
                )
            ]
        )

        if not answers:
            console.print("[red]No selection received. Try again.[/red]")
            continue

        selected = answers.get("clients") or []
        if not selected:
            console.print("[red]Please select at least one client.[/red]")
            continue

        if ALL_CLIENTS_LABEL in selected:
            return available_clients

        return selected
