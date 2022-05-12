using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ChatSR.Migrations
{
    public partial class mcol : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ConnectinId",
                table: "Users",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "Time",
                table: "Chats",
                type: "TEXT",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ConnectinId",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Time",
                table: "Chats");
        }
    }
}
