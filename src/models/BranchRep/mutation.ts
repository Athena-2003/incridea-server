import { builder } from "../../builder";

enum Role {
  BRANCH_REP="BRANCH_REP",
}

const RoleType = builder.enumType(Role, {
  name: "RoleType",
});


builder.mutationField("addBranchRep", (t) =>
  t.prismaField({
    type: "BranchRep",
    args: {
      branchId: t.arg({
        type: "ID",
        required: true,
      }),
      userId: t.arg({
        type: "ID",
        required: true,
      })
    },
    errors: {
      types: [Error],
    },
    resolve: async (query, root, args, ctx, info) => {
      const user = await ctx.user;
      if (!user) throw new Error("Not Authenticated");
      if (user.role !== "ADMIN") throw new Error("No Permission");
      const branch = await ctx.prisma.branch.findUnique({
        where: {
          id: Number(args.branchId),
        },
      });
      if (!branch) throw new Error(`No Branch with id ${args.branchId}`);

      const userRole = await ctx.prisma.user.findUnique({
        where: {
          id: Number(args.userId),
        },
      });

      const data = await ctx.prisma.branchRep.create({
        data: {
          Branch: {
            connect: {
              id: Number(args.branchId),
            },
          },
          User: {
            connect: {
              id: Number(args.userId),
            },
          },
        },
      });

      // Update the User record with the new Role
      if (data && userRole?.role === "PARTICIPANT") {
        await ctx.prisma.user.update({
          where: {
            id: Number(args.userId),
          },
          data: {
            role: Role.BRANCH_REP,
          },
        });
      }
      return data;
    },
  })
);